/**
 * Claude runner — spawns `claude -p` in the target project directory.
 * Returns a cancel function that kills the subprocess.
 */

import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import type { DesignRequest, RequestStatus, CompletePayload } from './queue.js'
import { config } from './config.js'

const CLAUDE_BIN = process.env['CLAUDE_BIN'] ?? 'claude'

type ServerMessage =
  | { type: 'design:processing'; id: string; status?: 'analyzing' | 'editing' }
  | { type: 'design:done'; id: string; action?: 'suggest' | 'develop'; content?: string; summary?: string; changedFiles?: string[] }
  | { type: 'design:failed'; id: string; error: string }

// ─── Workspace auto-discovery ─────────────────────────────────────────────────

/**
 * Given a page URL like http://localhost:3000/..., find the project root by:
 * 1. Extracting the port
 * 2. Finding the PID of the process listening on that port (lsof)
 * 3. Reading that process's cwd (lsof -p)
 */
function resolveWorkspaceFromUrl(pageUrl: string): string | null {
  try {
    const port = new URL(pageUrl).port
    if (!port) return null

    const pids = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8', timeout: 3000 }).trim()
    if (!pids) return null

    const pid = pids.split('\n')[0]?.trim()
    if (!pid) return null
    const lsofOut = execFileSync('lsof', ['-p', pid], { encoding: 'utf8', timeout: 3000 })
    const cwdLine = lsofOut.split('\n').find((l) => l.includes(' cwd '))
    if (!cwdLine) return null

    // Last whitespace-delimited token is the path
    const cwd = cwdLine.trim().split(/\s+/).at(-1) ?? ''
    return cwd && existsSync(cwd) ? cwd : null
  } catch {
    return null
  }
}

// ─── Path resolution ──────────────────────────────────────────────────────────

function resolveWorkspacePath(sourceFile: string): string {
  let dir = dirname(sourceFile)
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) || existsSync(join(dir, '.git'))) {
      return dir
    }
    dir = dirname(dir)
  }
  return dirname(sourceFile)
}

/**
 * Try to find the actual absolute path of a source file.
 * fiber._debugSource often gives a path like "/src/components/Foo.tsx" (no host prefix)
 * or a relative path. We search the workspace to resolve it.
 */
function resolveFilePath(sourceFile: string, workspacePath: string): string {
  // Already absolute and exists
  if (sourceFile.startsWith('/') && existsSync(sourceFile)) return sourceFile

  // Join with workspace
  const joined = join(workspacePath, sourceFile)
  if (existsSync(joined)) return joined

  // Strip leading slash and join
  const stripped = join(workspacePath, sourceFile.replace(/^\//, ''))
  if (existsSync(stripped)) return stripped

  // Search by filename in workspace (excluding node_modules / .git)
  const name = basename(sourceFile)
  try {
    const found = execFileSync('find', [
      workspacePath,
      '-name', name,
      '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
    ], { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0] ?? ''
    if (found && existsSync(found)) return found
  } catch { /* ignore */ }

  return sourceFile  // best-effort fallback
}

// ─── Server-side file pre-resolution ─────────────────────────────────────────

/**
 * Try to resolve the source file before spawning Claude, so the prompt can
 * include the exact path instead of asking Claude to grep.
 * Returns a list of candidate paths (ideally just 1). Empty = not found.
 */
function preResolveFile(
  componentName: string | null,
  distinctiveClass: string | null,
  workspacePath: string,
): string[] {
  const grep = (pattern: string, flags: string[] = []): string[] => {
    try {
      return execFileSync('grep', [
        '-rEl', pattern,
        ...flags,
        '--include=*.tsx', '--include=*.jsx', '--include=*.ts',
        '--exclude-dir=node_modules', '--exclude-dir=.next', '--exclude-dir=dist',
        workspacePath,
      ], { encoding: 'utf8', timeout: 5000 })
        .trim().split('\n').filter(Boolean)
    } catch { return [] }
  }

  // 1. Component name search (most precise)
  if (componentName) {
    const hits = grep(`(function|const|class) ${componentName}[^a-zA-Z0-9_]`)
    if (hits.length === 1) return hits   // unique match — done
    if (hits.length > 1 && distinctiveClass) {
      // Narrow down: which of those files also has the class?
      const narrowed = hits.filter((f) => {
        try {
          execFileSync('grep', ['-q', distinctiveClass, f], { timeout: 2000 })
          return true
        } catch { return false }
      })
      if (narrowed.length >= 1) return narrowed
    }
    if (hits.length > 0) return hits.slice(0, 3)
  }

  // 2. Fallback: class name search
  if (distinctiveClass) {
    const hits = grep(distinctiveClass.replaceAll(/[[\](){}.*+?^$|\\]/g, String.raw`\$&`))
    return hits.slice(0, 3)
  }

  return []
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

type ElementExtra = { fiber?: { componentName?: string | null }; breadcrumb?: string[] }

function buildBatchPrompt(req: DesignRequest): string {
  return `用户通过设计工具提交了一批 UI 修改需求，需要你修改源代码落实这些改动。

需求详情：
${req.userMessage}

请根据上述需求，逐项找到对应文件，使用 Edit 工具修改。只改与需求直接相关的代码，不要解释，不要描述，直接改文件。`
}

function buildPrompt(req: DesignRequest): string {
  const { element, userMessage } = req
  const { tag, classList, textContent, sourceFile, sourceLine } = element!
  const classStr = classList.length ? `.${classList.join('.')}` : ''
  const fileWithLine = sourceFile && sourceLine ? `${sourceFile}:${sourceLine}` : sourceFile!

  return `用户在浏览器中选中了一个 UI 元素，需要你立即修改源代码。

元素：<${tag}${classStr}>
内容：${textContent ? textContent.slice(0, 100) : '(无文本)'}
文件：${fileWithLine}
需求：${userMessage}

请现在立即使用 Edit 工具打开并修改 ${fileWithLine} 文件，完成上述需求。只改与需求直接相关的代码，不要解释，不要描述，直接改文件。`
}

function buildGrepPrompt(req: DesignRequest, candidateFiles: string[]): string {
  const { element, userMessage } = req
  const { tag, classList, textContent } = element!
  const extra = element as unknown as ElementExtra
  const componentName = extra.fiber?.componentName ?? null
  const breadcrumb = extra.breadcrumb ?? []
  const distinctiveClass = classList.find((c) => c.includes('[')) ?? classList.find((c) => c.length > 8) ?? classList[0]

  const classStr = classList.length ? `.${classList.join('.')}` : ''

  const hints: string[] = []
  if (componentName) hints.push(`组件名：${componentName}`)
  if (breadcrumb.length > 1) hints.push(`组件链（从内到外）：${breadcrumb.join(' > ')}`)
  if (textContent) hints.push(`元素可见文字：${textContent.slice(0, 80)}`)

  let locationSection: string
  if (candidateFiles.length === 1) {
    // Best case: server already found the file — Claude goes straight to Edit
    locationSection = `文件已定位：${candidateFiles[0]}

请直接使用 Edit 工具修改该文件，完成需求。`
  } else if (candidateFiles.length > 1) {
    // Multiple candidates — Claude picks the right one without grepping again
    locationSection = `候选文件（服务端预搜索结果，优先选与组件名 "${componentName ?? ''}" 匹配的）：
${candidateFiles.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

请打开最匹配的文件，找到渲染 <${tag}${classStr}> 的代码行，用 Edit 工具修改。`
  } else {
    // Nothing found — fall back to asking Claude to search
    const classSearchCmd = distinctiveClass
      ? `grep -r "${distinctiveClass}" . --include="*.tsx" --include="*.jsx" -l --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist`
      : null
    locationSection = `源文件未找到（SWC 编译，无调试信息）。请：
1. 用 Bash 搜索：${classSearchCmd ?? `grep -rE "function ${componentName}|const ${componentName}" . --include="*.tsx" -l --exclude-dir=node_modules`}
2. 找到正确文件后用 Edit 修改。`
  }

  return `用户在浏览器中选中了一个 UI 元素，需要你修改源代码。

元素：<${tag}${classStr}>
${hints.join('\n')}
需求：${userMessage}

${locationSection}

只改与需求直接相关的代码，不要解释，不要描述，直接改文件。`
}

// ─── Runner ───────────────────────────────────────────────────────────────────

// Maximum time to wait for claude subprocess; override via CLAUDE_TIMEOUT_MS env var (default 5 min)
const _parsedTimeout = Number.parseInt(process.env['CLAUDE_TIMEOUT_MS'] ?? '', 10)
const CLAUDE_TIMEOUT_MS = Number.isFinite(_parsedTimeout) && _parsedTimeout > 0 ? _parsedTimeout : 5 * 60 * 1000

interface ResolvedContext {
  workspacePath: string
  prompt: string
  fileResolved: boolean
}

function resolveContext(req: DesignRequest): ResolvedContext {
  const { element } = req

  let workspacePath: string
  if (element?.sourceFile) {
    workspacePath = resolveWorkspacePath(element.sourceFile)
  } else {
    const fromUrl = req.pageUrl ? resolveWorkspaceFromUrl(req.pageUrl) : null
    workspacePath = fromUrl ?? config.workspacePath ?? process.cwd()
  }

  if (!element) {
    return { workspacePath, prompt: buildBatchPrompt(req), fileResolved: false }
  }

  if (element.sourceFile) {
    const resolvedSourceFile = resolveFilePath(element.sourceFile, workspacePath)
    const enrichedReq: DesignRequest = { ...req, element: { ...element, sourceFile: resolvedSourceFile } }
    return { workspacePath, prompt: buildPrompt(enrichedReq), fileResolved: true }
  }

  // Source file unknown (SWC) — pre-grep on server to avoid extra Claude round-trips
  const extra = element as unknown as ElementExtra
  const componentName = extra.fiber?.componentName ?? null
  const distinctiveClass = element.classList.find((c) => c.includes('['))
    ?? element.classList.find((c) => c.length > 8)
    ?? element.classList[0]
    ?? null
  const candidates = preResolveFile(componentName, distinctiveClass, workspacePath)
  return { workspacePath, prompt: buildGrepPrompt(req, candidates), fileResolved: candidates.length === 1 }
}

function spawnClaude(
  id: string,
  ctx: ResolvedContext,
  complete: (id: string, payload: CompletePayload) => boolean,
  broadcast: (msg: ServerMessage) => void,
): () => void {
  const { workspacePath, prompt, fileResolved } = ctx
  const model = process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-4-6'
  // Bash is disabled by default — enable only via CLAUDE_ALLOW_BASH=true.
  // When the source file was not found we fall back to Edit,Write only;
  // the prompt already includes a grep suggestion as a text hint.
  const bashEnabled = process.env['CLAUDE_ALLOW_BASH'] === 'true'
  const allowedTools = bashEnabled && !fileResolved ? 'Edit,Write,Bash' : 'Edit,Write'
  const _parsedTurns = Number.parseInt(process.env['CLAUDE_MAX_TURNS'] ?? '', 10)
  const maxTurns = String(Number.isFinite(_parsedTurns) && _parsedTurns > 0 ? _parsedTurns : 15)

  const proc = spawn(CLAUDE_BIN, ['-p', prompt, '--allowedTools', allowedTools, '--model', model, '--max-turns', maxTurns], {
    cwd: workspacePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  let cancelled = false
  let settled = false
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []

  proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
  proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

  const settle = (fn: () => void): void => {
    if (settled) return
    settled = true
    clearTimeout(timeoutHandle)
    fn()
  }

  const timeoutHandle = setTimeout(() => {
    if (cancelled) return
    const errMsg = `Claude 超时未完成（超过 ${CLAUDE_TIMEOUT_MS / 1000} 秒）`
    settle(() => {
      proc.kill('SIGTERM')
      complete(id, { status: 'failed', error: errMsg })
      broadcast({ type: 'design:failed', id, error: errMsg })
    })
  }, CLAUDE_TIMEOUT_MS)

  proc.on('close', (code) => {
    if (cancelled) return
    settle(() => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
      if (code === 0) {
        const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
        const summary = lines.at(-1) ?? '修改完成'
        complete(id, { status: 'completed', summary, changedFiles: [] })
        broadcast({ type: 'design:done', id, action: 'develop', summary, changedFiles: [] })
      } else {
        const errDetail = stderr || stdout || `进程退出，退出码 ${code}`
        complete(id, { status: 'failed', error: errDetail.slice(0, 200) })
        broadcast({ type: 'design:failed', id, error: errDetail.slice(0, 200) })
      }
    })
  })

  proc.on('error', (err) => {
    if (cancelled) return
    const errMsg = `启动 Claude 失败：${err.message}`
    settle(() => {
      complete(id, { status: 'failed', error: errMsg })
      broadcast({ type: 'design:failed', id, error: errMsg })
    })
  })

  return (): void => {
    cancelled = true
    settle(() => {
      proc.kill('SIGTERM')
      complete(id, { status: 'failed', error: '用户取消' })
      broadcast({ type: 'design:failed', id, error: '用户取消' })
    })
  }
}

export function runClaudeOnRequest(
  req: DesignRequest,
  updateStatus: (id: string, status: RequestStatus) => void,
  complete: (id: string, payload: CompletePayload) => boolean,
  broadcast: (msg: ServerMessage) => void,
): () => void {
  const { id } = req
  const ctx = resolveContext(req)

  updateStatus(id, 'analyzing')
  broadcast({ type: 'design:processing', id, status: 'analyzing' })
  updateStatus(id, 'editing')
  broadcast({ type: 'design:processing', id, status: 'editing' })

  return spawnClaude(id, ctx, complete, broadcast)
}
