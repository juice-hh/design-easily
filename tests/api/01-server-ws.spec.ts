// Source: specs/01-server-ws-test-plan.md — Recommended First Batch

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  startTestServer,
  teardownTestServer,
  wsConnect,
  waitForMessage,
  wsSend,
  type TestServer,
} from '../helpers/server-harness.js'
import { readFileContext } from '../../server/src/fileReader.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/src/vscode.js', () => ({
  openInVSCode: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/src/fileReader.js', () => ({
  readFileContext: vi.fn().mockResolvedValue(null),
  readFullFile: vi.fn().mockResolvedValue(null),
  isPathAllowed: vi.fn().mockReturnValue(true),
}))

vi.mock('../../server/src/openai.js', () => ({
  streamOpenAIResponse: vi.fn().mockImplementation(
    async (
      _model: string,
      _msgs: unknown,
      { onChunk, onDone }: { onChunk: (t: string) => void; onDone: () => void },
    ) => {
      onChunk('OpenAI ')
      onChunk('response')
      onDone()
    },
  ),
}))

vi.mock('../../server/src/ai.js', () => ({
  streamAIResponse: vi.fn().mockImplementation(
    async (
      _model: string,
      _msgs: unknown,
      { onChunk, onDone }: { onChunk: (t: string) => void; onDone: () => void },
    ) => {
      onChunk('Hello ')
      onChunk('world')
      onDone()
    },
  ),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('01 — Server WebSocket', () => {
  describe('HTTP', () => {
    it('GET /health returns 200 + { ok: true }', async () => {
      const res = await fetch(`${server.baseUrl}/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true })
    })
  })

  describe('ping → pong', () => {
    it('responds with pong for a ping message', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })

  describe('vscode:open', () => {
    it('calls openInVSCode and replies vscode:opened', async () => {
      const { openInVSCode } = await import('../../server/src/vscode.js')
      const mockOpen = vi.mocked(openInVSCode)
      mockOpen.mockClear()

      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'vscode:open', file: '/src/app.tsx', line: 42 })

      expect(await reply).toEqual({ type: 'vscode:opened', file: '/src/app.tsx', line: 42 })
      expect(mockOpen).toHaveBeenCalledWith('/src/app.tsx', 42)
      ws.close()
    })

    it('ignores empty file path — does not call openInVSCode', async () => {
      const { openInVSCode } = await import('../../server/src/vscode.js')
      vi.mocked(openInVSCode).mockClear()

      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'vscode:open', file: '', line: 1 })
      await new Promise((r) => setTimeout(r, 200))
      expect(vi.mocked(openInVSCode)).not.toHaveBeenCalled()
      ws.close()
    })
  })

  describe('ai:chat', () => {
    it('streams chunks and sends ai:done', async () => {
      const ws = await wsConnect(server.wsUrl)
      const received: unknown[] = []

      const done = new Promise<void>((resolve) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          received.push(msg)
          if ((msg as { type: string }).type === 'ai:done') resolve()
        })
      })

      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-test-1',
        messages: [{ role: 'user', content: 'hello' }],
      })

      await done
      ws.close()

      const chunks = received.filter((m) => (m as { type: string }).type === 'ai:chunk')
      expect(chunks.length).toBeGreaterThan(0)
      expect(received[received.length - 1]).toMatchObject({ type: 'ai:done', requestId: 'req-test-1' })
    })

    it('routes through streamOpenAIResponse when aiProvider is openai (app.ts:193-194)', async () => {
      const { config } = await import('../../server/src/config.js')
      const { streamOpenAIResponse } = await import('../../server/src/openai.js')
      const original = config.aiProvider
      config.aiProvider = 'openai'

      try {
        const ws = await wsConnect(server.wsUrl)
        const received: unknown[] = []
        const done = new Promise<void>((resolve) => {
          ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString())
            received.push(msg)
            if ((msg as { type: string }).type === 'ai:done') resolve()
          })
        })

        wsSend(ws, {
          type: 'ai:chat',
          requestId: 'req-openai',
          messages: [{ role: 'user', content: 'hello openai' }],
        })

        await done
        ws.close()

        expect(vi.mocked(streamOpenAIResponse)).toHaveBeenCalled()
        expect(received[received.length - 1]).toMatchObject({ type: 'ai:done', requestId: 'req-openai' })
      } finally {
        config.aiProvider = original
      }
    })

    it('sends ai:error via onError callback when streamAIResponse throws (app.ts:189)', async () => {
      const { streamAIResponse } = await import('../../server/src/ai.js')
      vi.mocked(streamAIResponse).mockImplementationOnce(
        async (
          _model: string,
          _msgs: unknown,
          { onError }: { onChunk: (t: string) => void; onDone: () => void; onError: (e: Error) => void },
        ) => {
          onError(new Error('simulated AI failure'))
        },
      )

      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-onerror',
        messages: [{ role: 'user', content: 'trigger error' }],
      })
      expect(await reply).toMatchObject({ type: 'ai:error', requestId: 'req-onerror' })
      ws.close()
    })

    it('returns ai:error for empty messages array', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ai:chat', requestId: 'req-empty', messages: [] })
      expect(await reply).toMatchObject({ type: 'ai:error', requestId: 'req-empty' })
      ws.close()
    })

    it('skips enrichment and still responds when readFileContext returns null (app.ts:219)', async () => {
      // readFileContext mock defaults to null (set in vi.mock factory) — no override needed
      const ws = await wsConnect(server.wsUrl)
      const received: unknown[] = []
      const done = new Promise<void>((resolve) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          received.push(msg)
          if ((msg as { type: string }).type === 'ai:done') resolve()
        })
      })

      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-enrich-null',
        messages: [{ role: 'user', content: '这个怎么改？源文件：`/src/Missing.tsx:99`' }],
      })

      await done
      ws.close()

      // Should still complete normally — null ctx just skips enrichment
      expect(received[received.length - 1]).toMatchObject({ type: 'ai:done', requestId: 'req-enrich-null' })
    })

    it('enriches message with file context when content contains 源文件 marker (app.ts:213-222)', async () => {
      // This test covers the enrichWithFileContext path in app.ts.
      // We mock fileReader so no real FS access happens.
      const { readFileContext } = await import('../../server/src/fileReader.js')
      vi.mocked(readFileContext).mockResolvedValueOnce({
        file: '/src/Button.tsx',
        line: 12,
        language: 'tsx',
        snippet: 'export function Button() { return <button /> }',
      })

      const ws = await wsConnect(server.wsUrl)
      const received: unknown[] = []
      const done = new Promise<void>((resolve) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          received.push(msg)
          if ((msg as { type: string }).type === 'ai:done') resolve()
        })
      })

      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-enrich',
        messages: [{ role: 'user', content: '这个组件怎么修改？源文件：`/src/Button.tsx:12`' }],
      })

      await done
      ws.close()

      expect(received[received.length - 1]).toMatchObject({ type: 'ai:done', requestId: 'req-enrich' })
    })
  })

  describe('file:read', () => {
    it('replies file:content when readFullFile returns a result (app.ts:177-185)', async () => {
      const { readFullFile } = await import('../../server/src/fileReader.js')
      vi.mocked(readFullFile).mockResolvedValueOnce({
        file: '/src/App.tsx',
        content: 'export default function App() {}',
        language: 'tsx',
        totalLines: 1,
        truncated: false,
      })

      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'file:read', file: '/src/App.tsx', requestId: 'req-fr-1' })

      expect(await reply).toMatchObject({
        type: 'file:content',
        requestId: 'req-fr-1',
        content: 'export default function App() {}',
        language: 'tsx',
        totalLines: 1,
        truncated: false,
      })
      ws.close()
    })

    it('replies file:error when readFullFile returns null (app.ts:187)', async () => {
      const { readFullFile } = await import('../../server/src/fileReader.js')
      vi.mocked(readFullFile).mockResolvedValueOnce(null)

      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'file:read', file: '/no/such/file.tsx', requestId: 'req-fr-2' })

      expect(await reply).toMatchObject({
        type: 'file:error',
        requestId: 'req-fr-2',
        error: expect.stringContaining('/no/such/file.tsx'),
      })
      ws.close()
    })

    it('silently ignores file:read when file is missing (app.ts:175)', async () => {
      const { readFullFile } = await import('../../server/src/fileReader.js')
      vi.mocked(readFullFile).mockClear()

      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'file:read', requestId: 'req-fr-guard' })
      await new Promise((r) => setTimeout(r, 100))
      expect(vi.mocked(readFullFile)).not.toHaveBeenCalled()

      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })

  describe('design:request guard', () => {
    it('silently ignores design:request when element is missing (app.ts:172)', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', userMessage: 'no element' })
      await new Promise((r) => setTimeout(r, 100))
      // Server should still respond to ping — no crash
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })

  describe('enrichWithFileContext', () => {
    it('skips enrichment when first message has assistant role (app.ts:210)', async () => {
      const ws = await wsConnect(server.wsUrl)
      const received: unknown[] = []
      const done = new Promise<void>((resolve) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          received.push(msg)
          if ((msg as { type: string }).type === 'ai:done') resolve()
        })
      })

      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-assistant-role',
        messages: [{ role: 'assistant', content: '源文件：`/src/App.tsx:10`' }],
      })

      await done
      ws.close()
      expect(received[received.length - 1]).toMatchObject({ type: 'ai:done', requestId: 'req-assistant-role' })
    })
  })

  describe('send() closed-ws guard', () => {
    it('does not crash when WebSocket closes before send() is called (app.ts:139)', async () => {
      const { openInVSCode } = await import('../../server/src/vscode.js')

      let resolveVSCode!: () => void
      vi.mocked(openInVSCode).mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolveVSCode = resolve }),
      )

      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'vscode:open', file: '/src/Slow.tsx', line: 1 })

      // Wait for server to start awaiting openInVSCode
      await new Promise((r) => setTimeout(r, 80))

      // Close client — server-side ws transitions to CLOSED
      ws.close()
      await new Promise((r) => setTimeout(r, 150))

      // Resolve now — server calls send(closedWs, ...) → skipped by readyState guard
      resolveVSCode()
      await new Promise((r) => setTimeout(r, 100))
      // No crash — test passes if we reach here
    })
  })

  describe('malformed JSON', () => {
    it('silently ignores non-JSON messages without crashing', async () => {
      const ws = await wsConnect(server.wsUrl)
      ws.send('NOT_JSON{{{{')
      await new Promise((r) => setTimeout(r, 100))

      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })
})
