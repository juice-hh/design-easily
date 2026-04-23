// Security regression tests for design-easily server.
// Covers: WS origin guard (app.ts), path allowlist (fileReader.ts), VS Code
// path validation (vscode.ts), HTTP API bearer token auth (auth.ts).

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import {
  startTestServer,
  teardownTestServer,
  wsConnect,
  waitForMessage,
  wsSend,
  fetchWithToken,
  type TestServer,
} from '../helpers/server-harness.js'
import { isPathAllowed } from '../../server/src/fileReader.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Do NOT mock isPathAllowed — we want the real implementation for path
// validation regression tests. Mock readFullFile/readFileContext so no real
// disk IO happens.

vi.mock('../../server/src/vscode.js', () => ({
  openInVSCode: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/src/fileReader.js', async () => {
  const actual = await vi.importActual<typeof import('../../server/src/fileReader.js')>(
    '../../server/src/fileReader.js',
  )
  return {
    ...actual,
    readFileContext: vi.fn().mockResolvedValue(null),
    readFullFile: vi.fn().mockResolvedValue(null),
    // isPathAllowed is the REAL implementation (from ...actual) — not mocked.
  }
})

vi.mock('../../server/src/openai.js', () => ({
  streamOpenAIResponse: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/src/ai.js', () => ({
  streamAIResponse: vi.fn().mockResolvedValue(undefined),
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

let server: TestServer

beforeAll(async () => {
  server = await startTestServer()
}, 10_000)

afterAll(async () => {
  await server?.close()
  teardownTestServer()
})

// Helper: open a WS with custom Origin header.
function wsConnectWithOrigin(url: string, origin: string | undefined): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (origin !== undefined) headers['origin'] = origin
    const ws = new WebSocket(url, { headers })
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 3000)
    ws.on('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    ws.on('close', () => {
      clearTimeout(timer)
      // Resolve anyway — server may close after handshake but before open fires
      // on some platforms. Caller must check readyState.
      resolve(ws)
    })
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('07 — Security regression', () => {
  // ─── A. WS Origin rejection ──────────────────────────────────────────────────
  describe('A. WS Origin guard (app.ts isAllowedOrigin)', () => {
    it('closes connection with Origin: https://evil.com (no pong received)', async () => {
      const ws = await wsConnectWithOrigin(server.wsUrl, 'https://evil.com')

      const closed = new Promise<number>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          resolve(1008)
          return
        }
        ws.on('close', (code) => resolve(code))
      })

      // Race: try send ping; server should have closed us with 1008.
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      } catch {
        /* expected — socket already closed */
      }

      // Should receive close, not a pong.
      const gotPong = new Promise<boolean>((resolve) => {
        const to = setTimeout(() => resolve(false), 500)
        ws.once('message', () => {
          clearTimeout(to)
          resolve(true)
        })
      })

      const [code, pong] = await Promise.all([closed, gotPong])
      expect(pong).toBe(false)
      expect(code).toBe(1008)
    })

    it('closes connection with no Origin header', async () => {
      const ws = await wsConnectWithOrigin(server.wsUrl, undefined)

      const closed = new Promise<number>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          resolve(1008)
          return
        }
        ws.on('close', (code) => resolve(code))
      })

      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      } catch { /* expected */ }

      const gotPong = new Promise<boolean>((resolve) => {
        const to = setTimeout(() => resolve(false), 500)
        ws.once('message', () => { clearTimeout(to); resolve(true) })
      })

      const [code, pong] = await Promise.all([closed, gotPong])
      expect(pong).toBe(false)
      expect(code).toBe(1008)
    })

    it('allows connection with Origin: http://localhost:3771', async () => {
      const ws = await wsConnectWithOrigin(server.wsUrl, 'http://localhost:3771')
      expect(ws.readyState).toBe(WebSocket.OPEN)

      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })

    it('allows connection with Origin: chrome-extension://abc123', async () => {
      const ws = await wsConnectWithOrigin(server.wsUrl, 'chrome-extension://abc123')
      expect(ws.readyState).toBe(WebSocket.OPEN)

      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })

  // ─── B. Path allowlist unit tests ────────────────────────────────────────────
  describe('B. isPathAllowed (fileReader.ts)', () => {
    const root = process.cwd()

    it('returns false for relative paths', () => {
      expect(isPathAllowed('relative/path.tsx', [root])).toBe(false)
    })

    it('returns false for path traversal (non-normalized ../)', () => {
      expect(isPathAllowed('/workspace/../etc/passwd', [root])).toBe(false)
    })

    it('returns true for path within allowed root', () => {
      expect(isPathAllowed(`${root}/server/src/app.ts`, [root])).toBe(true)
    })

    it('returns false for path outside allowed root', () => {
      expect(isPathAllowed('/etc/passwd', [root])).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isPathAllowed('', [root])).toBe(false)
    })
  })

  // ─── C. file:read path validation ────────────────────────────────────────────
  describe('C. file:read rejects paths outside workspace', () => {
    it('returns file:error with "拒绝访问" for path outside workspace', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'file:read', file: '/etc/passwd', requestId: 'req-sec-1' })

      const msg = (await reply) as { type: string; requestId: string; error: string }
      expect(msg.type).toBe('file:error')
      expect(msg.requestId).toBe('req-sec-1')
      expect(msg.error).toContain('拒绝访问')
      ws.close()
    })

    it('returns file:error for relative path', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'file:read', file: 'relative/path.tsx', requestId: 'req-sec-2' })

      const msg = (await reply) as { type: string; error: string }
      expect(msg.type).toBe('file:error')
      expect(msg.error).toContain('拒绝访问')
      ws.close()
    })

    it('returns file:error for path traversal attempts', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, {
        type: 'file:read',
        file: '/workspace/../etc/passwd',
        requestId: 'req-sec-3',
      })

      const msg = (await reply) as { type: string; error: string }
      expect(msg.type).toBe('file:error')
      expect(msg.error).toContain('拒绝访问')
      ws.close()
    })
  })

  // ─── D. ai:chat source-file context injection ────────────────────────────────
  describe('D. ai:chat rejects out-of-workspace source file context', () => {
    it('does not inject file context for paths outside workspace', async () => {
      const { readFileContext } = await import('../../server/src/fileReader.js')
      vi.mocked(readFileContext).mockClear()

      const ws = await wsConnect(server.wsUrl)

      // Embed an out-of-workspace path in the message the way the extension does
      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'sec-ai-1',
        messages: [{ role: 'user', content: '请修改\n源文件：`/etc/passwd:1`\n的样式' }],
      })

      // Wait for server to process, then verify readFileContext was never called with /etc/passwd
      await new Promise((r) => setTimeout(r, 200))
      expect(vi.mocked(readFileContext)).not.toHaveBeenCalledWith('/etc/passwd', expect.anything())
      ws.close()
    })
  })

  // ─── E. vscode:open path validation ──────────────────────────────────────────
  describe('E. vscode:open rejects invalid paths', () => {
    it('silently ignores relative path (no response, no crash)', async () => {
      const { openInVSCode } = await import('../../server/src/vscode.js')
      vi.mocked(openInVSCode).mockClear()

      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'vscode:open', file: 'relative/path', line: 1 })

      // No response expected — wait briefly, then verify ping still works.
      await new Promise((r) => setTimeout(r, 150))
      expect(vi.mocked(openInVSCode)).not.toHaveBeenCalled()

      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })

    it('silently ignores path-traversal path (no response, no crash)', async () => {
      const { openInVSCode } = await import('../../server/src/vscode.js')
      vi.mocked(openInVSCode).mockClear()

      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'vscode:open', file: '/workspace/../etc/passwd', line: 1 })

      await new Promise((r) => setTimeout(r, 150))
      expect(vi.mocked(openInVSCode)).not.toHaveBeenCalled()

      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })

  // ─── F. HTTP API bearer-token auth ───────────────────────────────────────────
  describe('F. HTTP API bearer-token auth', () => {
    it('GET /api/next returns 401 with no Authorization header', async () => {
      const res = await fetch(`${server.baseUrl}/api/next?timeout=50`)
      expect(res.status).toBe(401)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
    })

    it('GET /api/next returns 401 with wrong token', async () => {
      const res = await fetch(`${server.baseUrl}/api/next?timeout=50`, {
        headers: { Authorization: 'Bearer wrong-token' },
      })
      expect(res.status).toBe(401)
    })

    it('GET /api/next returns 200 with correct token', async () => {
      const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=50`)
      expect(res.status).toBe(200)
    })

    it('POST /api/complete/:id returns 401 with no token', async () => {
      const res = await fetch(`${server.baseUrl}/api/complete/any-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      expect(res.status).toBe(401)
    })

    it('GET /api/requests/:id returns 401 with no token', async () => {
      const res = await fetch(`${server.baseUrl}/api/requests/any-id`)
      expect(res.status).toBe(401)
    })

    it('GET /health remains accessible without token', async () => {
      const res = await fetch(`${server.baseUrl}/health`)
      expect(res.status).toBe(200)
    })
  })
})
