/**
 * File reader — reads source code context around a given line.
 * Used to provide AI with relevant code snippet.
 */

import { readFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { resolve, normalize, isAbsolute } from 'node:path'

const CONTEXT_LINES = 20
const MAX_FILE_LINES = 2000

/**
 * Validates that a file path is absolute, normalized, and within at least one
 * of the given allowed roots. Prevents path traversal / arbitrary file reads.
 */
export function isPathAllowed(file: string, allowedRoots: string[]): boolean {
  if (!isAbsolute(file)) return false
  const normalized = normalize(file)
  if (normalized !== file) return false // reject paths with ../ components after normalize

  // Resolve symlinks so a symlink inside the workspace pointing outside is rejected.
  // Fall back to the normalized path when the file doesn't exist yet (no symlink possible).
  let realFile: string
  try { realFile = realpathSync(normalized) } catch { realFile = normalized }

  const roots = allowedRoots.length > 0 ? allowedRoots : [resolve(process.cwd())]
  return roots.some((root) => {
    let normalizedRoot: string
    try { normalizedRoot = realpathSync(resolve(root)) } catch { normalizedRoot = normalize(resolve(root)) }
    return realFile.startsWith(normalizedRoot + '/')
  })
}

export interface FileContext {
  file: string
  line: number
  snippet: string
  language: string
}

function detectLanguage(file: string): string {
  const ext = file.split('.').pop()!.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    vue: 'vue', svelte: 'svelte', css: 'css', scss: 'scss',
    json: 'json', html: 'html',
  }
  return map[ext] ?? 'text'
}

export interface FullFileContent {
  file: string
  content: string
  language: string
  totalLines: number
  truncated: boolean
}

export async function readFullFile(file: string): Promise<FullFileContent | null> {
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf-8')
    const lines = raw.split('\n')
    const truncated = lines.length > MAX_FILE_LINES
    const content = truncated ? lines.slice(0, MAX_FILE_LINES).join('\n') : raw
    return { file, content, language: detectLanguage(file), totalLines: lines.length, truncated }
  } catch (err) {
    console.error('[fileReader] readFullFile failed:', file, err)
    return null
  }
}

export async function readFileContext(
  file: string,
  line: number,
): Promise<FileContext | null> {
  if (!existsSync(file)) return null

  try {
    const content = await readFile(file, 'utf-8')
    const lines = content.split('\n')
    const start = Math.max(0, line - CONTEXT_LINES - 1)
    const end = Math.min(lines.length, line + CONTEXT_LINES)
    const snippet = lines.slice(start, end).join('\n')

    return {
      file,
      line,
      snippet,
      language: detectLanguage(file),
    }
  } catch (err) {
    console.error('[fileReader] readFileContext failed:', file, err)
    return null
  }
}
