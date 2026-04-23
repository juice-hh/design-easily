/**
 * App factory — creates and wires the Express app + WebSocket server.
 * Separated from index.ts so it can be imported in tests without side effects.
 */

import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, type Server } from 'node:http'
import { config } from './config.js'
import { tokenMiddleware } from './auth.js'
import { openInVSCode } from './vscode.js'
import { readFileContext, readFullFile, isPathAllowed } from './fileReader.js'
import { streamAIResponse, type ChatMessage } from './ai.js'
import { streamOpenAIResponse } from './openai.js'
import { queue, type ElementContext } from './queue.js'
import { runClaudeOnRequest } from './claude-runner.js'

const LONG_POLL_DEFAULT_MS = 30_000
const LONG_POLL_MAX_MS = 60_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20

// ─── Message types ────────────────────────────────────────────────────────────

type ClientMessage =
  | { type: 'vscode:open'; file: string; line: number }
  | { type: 'file:read'; file: string; requestId: string }
  | { type: 'ai:chat'; requestId: string; messages: ChatMessage[]; model?: string }
  | { type: 'design:request'; element: ElementContext | null; userMessage: string; action?: 'suggest' | 'develop'; pageUrl?: string }
  | { type: 'design:cancel'; id: string }
  | { type: 'ping' }

type ServerMessage =
  | { type: 'vscode:opened'; file: string; line: number }
  | { type: 'vscode:error'; file: string; line: number; error: string }
  | { type: 'file:content'; requestId: string; content: string; language: string; totalLines: number; truncated: boolean }
  | { type: 'file:error'; requestId: string; error: string }
  | { type: 'ai:chunk'; text: string; requestId: string }
  | { type: 'ai:done'; requestId: string }
  | { type: 'ai:error'; error: string; requestId: string }
  | { type: 'design:queued'; id: string }
  | { type: 'design:processing'; id: string; status?: 'analyzing' | 'editing' }
  | { type: 'design:done'; id: string; action?: 'suggest' | 'develop'; content?: string; summary?: string; changedFiles?: string[]; noChanges?: boolean }
  | { type: 'design:failed'; id: string; error: string }
  | { type: 'pong' }

// ─── Origin guard ─────────────────────────────────────────────────────────────

function isAllowedOrigin(origin: string): boolean {
  if (origin.startsWith('chrome-extension://')) {
    const allowedId = config.allowedExtensionId
    // Dev mode: any chrome-extension:// is allowed when EXTENSION_ID is not configured.
    if (!allowedId) return true
    return origin === `chrome-extension://${allowedId}`
  }
  return (
    origin === 'http://localhost' ||
    origin === 'http://127.0.0.1' ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  )
}

// ─── WS message handler ───────────────────────────────────────────────────────

interface WsHandlerCtx {
  allowedRoots: string[]
  cancelMap: Map<string, () => void>
  send: (ws: WebSocket, msg: ServerMessage) => void
  broadcast: (msg: ServerMessage) => void
  rateLimit: { count: number; windowStart: number }
}

type VscodeOpenMsg = Extract<ClientMessage, { type: 'vscode:open' }>
type FileReadMsg   = Extract<ClientMessage, { type: 'file:read' }>
type DesignReqMsg  = Extract<ClientMessage, { type: 'design:request' }>
type DesignCanMsg  = Extract<ClientMessage, { type: 'design:cancel' }>
type AiChatMsg     = Extract<ClientMessage, { type: 'ai:chat' }>

async function handleVscodeOpen(ws: WebSocket, msg: VscodeOpenMsg, ctx: WsHandlerCtx): Promise<void> {
  const { file, line } = msg
  if (!file || !isPathAllowed(file, ctx.allowedRoots)) return
  try {
    await openInVSCode(file, line)
    ctx.send(ws, { type: 'vscode:opened', file, line })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[vscode:open] failed:', error)
    ctx.send(ws, { type: 'vscode:error', file, line, error })
  }
}

async function handleFileRead(ws: WebSocket, msg: FileReadMsg, ctx: WsHandlerCtx): Promise<void> {
  const { file, requestId } = msg
  if (!file || !requestId) return
  if (!isPathAllowed(file, ctx.allowedRoots)) {
    ctx.send(ws, { type: 'file:error', requestId, error: `拒绝访问: ${file}` })
    return
  }
  const result = await readFullFile(file)
  if (result) {
    ctx.send(ws, { type: 'file:content', requestId, content: result.content, language: result.language, totalLines: result.totalLines, truncated: result.truncated })
  } else {
    ctx.send(ws, { type: 'file:error', requestId, error: `文件不存在或无法读取: ${file}` })
  }
}

function isRateLimited(ctx: WsHandlerCtx): boolean {
  const now = Date.now()
  if (now - ctx.rateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
    ctx.rateLimit.count = 0
    ctx.rateLimit.windowStart = now
  }
  ctx.rateLimit.count++
  return ctx.rateLimit.count > RATE_LIMIT_MAX_REQUESTS
}

function handleDesignRequest(ws: WebSocket, msg: DesignReqMsg, ctx: WsHandlerCtx): void {
  const { element, userMessage, action, pageUrl } = msg
  if (typeof userMessage !== 'string' || userMessage.trim().length === 0 || userMessage.length > 10_000) return
  if (isRateLimited(ctx)) {
    const id = `rate-limited-${Date.now()}`
    ctx.send(ws, { type: 'design:failed', id, error: '请求频率超限，请稍后重试' })
    return
  }
  const request = queue.enqueue(element, userMessage, action, pageUrl)
  ctx.send(ws, { type: 'design:queued', id: request.id })
  if (action !== 'develop') return
  // Claim synchronously — dequeue() only returns 'suggest' requests,
  // so there is no race with the /api/next poller.
  const claimed = queue.claimById(request.id)
  if (claimed) {
    const cancel = runClaudeOnRequest(claimed, queue.updateStatus.bind(queue), queue.complete.bind(queue), ctx.broadcast)
    ctx.cancelMap.set(claimed.id, cancel)
  }
}

function handleDesignCancel(msg: DesignCanMsg, ctx: WsHandlerCtx): void {
  const cancel = ctx.cancelMap.get(msg.id)
  if (cancel) {
    cancel()
    ctx.cancelMap.delete(msg.id)
    return
  }
  // Request is in queue but subprocess not yet started — cancel in queue directly.
  const cancelled = queue.cancel(msg.id)
  if (cancelled) ctx.broadcast({ type: 'design:failed', id: msg.id, error: '用户取消' })
}

async function handleAiChat(ws: WebSocket, msg: AiChatMsg, ctx: WsHandlerCtx): Promise<void> {
  const { requestId, messages, model } = msg
  if (!messages?.length) {
    ctx.send(ws, { type: 'ai:error', error: 'messages must not be empty', requestId })
    return
  }
  const enriched = await enrichWithFileContext(messages, ctx.allowedRoots)
  const callbacks = {
    onChunk: (text: string) => ctx.send(ws, { type: 'ai:chunk', text, requestId }),
    onDone: () => ctx.send(ws, { type: 'ai:done', requestId }),
    onError: (err: Error) => ctx.send(ws, { type: 'ai:error', error: err.message, requestId }),
  }
  if (config.aiProvider === 'openai') {
    await streamOpenAIResponse(model ?? config.openaiDefaultModel, enriched, callbacks)
  } else {
    await streamAIResponse(model ?? config.defaultModel, enriched, callbacks)
  }
}

async function handleClientMessage(ws: WebSocket, msg: ClientMessage, ctx: WsHandlerCtx): Promise<void> {
  switch (msg.type) {
    case 'ping':            ctx.send(ws, { type: 'pong' }); break
    case 'vscode:open':    await handleVscodeOpen(ws, msg, ctx); break
    case 'file:read':      await handleFileRead(ws, msg, ctx); break
    case 'design:request': handleDesignRequest(ws, msg, ctx); break
    case 'design:cancel':  handleDesignCancel(msg, ctx); break
    case 'ai:chat':        await handleAiChat(ws, msg, ctx); break
  }
}

// ─── /api/complete handler ────────────────────────────────────────────────────

interface CompleteBody {
  status?: 'completed' | 'failed'
  summary?: string
  changedFiles?: string[]
  error?: string
  content?: string
}

function handleCompleteRequest(
  id: string,
  body: CompleteBody,
  res: import('express').Response,
  broadcast: (msg: ServerMessage) => void,
): void {
  const { status, summary, changedFiles, error, content } = body
  if (!status) { res.status(400).json({ ok: false, error: 'status is required' }); return }
  if (status === 'failed' && !error) { res.status(400).json({ ok: false, error: 'error field is required when status is failed' }); return }

  const existing = queue.getById(id)
  if (!existing) { res.status(404).json({ ok: false, error: 'request not found' }); return }

  const changed = queue.complete(id, { status, summary, changedFiles, error, content })
  if (changed) {
    if (status === 'completed') {
      const files = existing.changedFiles ?? []
      broadcast({ type: 'design:done', id, action: existing.action, content: existing.content, summary: existing.summary ?? '', changedFiles: files, noChanges: files.length === 0 })
    } else {
      broadcast({ type: 'design:failed', id, error: error! })
    }
  }
  res.json({ ok: true })
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface AppInstance {
  httpServer: Server
}

export default function createApp(): AppInstance {
  const app = express()
  app.use(express.json())

  // CORS — restrict to chrome-extension origins and localhost
  app.use((req, res, next) => {
    const origin = req.headers['origin']
    if (origin && isAllowedOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    next()
  })

  app.get('/health', (_req, res) => { res.json({ ok: true, version: '0.1.0' }) })

  // GET /api/next?timeout=<ms> — long-poll, atomic claim (token-protected)
  app.get('/api/next', tokenMiddleware, async (req, res) => {
    const rawTimeout = typeof req.query['timeout'] === 'string' ? req.query['timeout'] : String(LONG_POLL_DEFAULT_MS)
    const timeoutMs = Math.min(parseInt(rawTimeout, 10), LONG_POLL_MAX_MS)
    const request = await queue.dequeue(timeoutMs)
    if (request) broadcast({ type: 'design:processing', id: request.id })
    res.json({ ok: true, request: request ?? null })
  })

  // POST /api/complete/:id — Claude Code writes back result (token-protected)
  app.post('/api/complete/:id', tokenMiddleware, (req, res) => {
    handleCompleteRequest(req.params['id'] ?? '', req.body as CompleteBody, res, broadcast)
  })

  // GET /api/requests/:id — status lookup for browser reconnection (token-protected)
  app.get('/api/requests/:id', tokenMiddleware, (req, res) => {
    const request = queue.getById(req.params['id'] ?? '')
    if (!request) { res.status(404).json({ ok: false, error: 'not found' }); return }
    const { id, action, status, summary, changedFiles, content, error, createdAt, claimedAt, completedAt } = request
    res.json({ id, action, status, summary, changedFiles, content, error, createdAt, claimedAt, completedAt })
  })

  const cancelMap = new Map<string, () => void>()
  const httpServer = createServer(app)
  const wss = new WebSocketServer({ server: httpServer })

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg)
    wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) client.send(payload) })
  }

  wss.on('connection', (ws, req) => {
    const origin = req.headers['origin']
    if (!origin || !isAllowedOrigin(origin)) { ws.close(1008, 'Origin not allowed'); return }

    const ctx: WsHandlerCtx = {
      allowedRoots: [config.workspacePath ?? process.cwd()],
      cancelMap,
      send,
      broadcast,
      rateLimit: { count: 0, windowStart: Date.now() },
    }

    ws.on('message', async (raw) => {
      let msg: ClientMessage
      try { msg = JSON.parse(raw.toString()) as ClientMessage } catch { return }
      await handleClientMessage(ws, msg, ctx)
    })
  })

  return { httpServer }
}

async function enrichWithFileContext(messages: ChatMessage[], allowedRoots: string[]): Promise<ChatMessage[]> {
  const first = messages[0]
  if (!first || first.role !== 'user') return messages

  const fileMatch = first.content.match(/源文件：`([^`]+):(\d+)`/)
  if (!fileMatch) return messages

  const [, file, lineStr] = fileMatch
  if (!isPathAllowed(file, allowedRoots)) return messages

  const line = parseInt(lineStr, 10)
  const ctx = await readFileContext(file, line)

  if (!ctx) return messages

  const enriched = `${first.content}\n\n源码片段（${ctx.file}，第 ${ctx.line} 行附近）：\n\`\`\`${ctx.language}\n${ctx.snippet}\n\`\`\``
  return [{ role: 'user', content: enriched }, ...messages.slice(1)]
}
