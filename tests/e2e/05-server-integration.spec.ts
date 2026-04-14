// Source: specs/05-server-integration-test-plan.md — Recommended First Batch

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { AddressInfo } from 'node:net'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  startTestServer,
  teardownTestServer,
  wsConnect,
  waitForMessage,
  wsSend,
  type TestServer,
} from '../helpers/server-harness.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../server/src/vscode.js', () => ({
  openInVSCode: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/src/ai.js', () => ({
  streamAIResponse: vi.fn().mockImplementation(
    async (
      _model: string,
      _msgs: unknown,
      { onChunk, onDone }: { onChunk: (t: string) => void; onDone: () => void },
    ) => {
      onChunk('integration ')
      onChunk('response')
      onDone()
    },
  ),
}))

vi.mock('../../server/src/openai.js', () => ({
  streamOpenAIResponse: vi.fn().mockResolvedValue(undefined),
}))

// fileReader is NOT mocked — tests use the real implementation with real/missing temp files.

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

describe('05 — Server 集成测试', () => {
  // ── 完整链路: WS 连接 + ping/pong ──────────────────────────────────────────
  describe('完整链路: WebSocket 连接与 ping/pong', () => {
    it('connects and receives pong for ping', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'ping' })
      expect(await reply).toEqual({ type: 'pong' })
      ws.close()
    })
  })

  // ── 完整链路: vscode:open ──────────────────────────────────────────────────
  describe('完整链路: vscode:open（exec mock）', () => {
    it('calls openInVSCode and replies vscode:opened', async () => {
      const { openInVSCode } = await import('../../server/src/vscode.js')
      vi.mocked(openInVSCode).mockClear()

      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'vscode:open', file: '/src/App.tsx', line: 10 })

      expect(await reply).toEqual({ type: 'vscode:opened', file: '/src/App.tsx', line: 10 })
      expect(vi.mocked(openInVSCode)).toHaveBeenCalledWith('/src/App.tsx', 10)
      ws.close()
    })
  })

  // ── 完整链路: ai:chat + 源文件注入 ────────────────────────────────────────
  describe('完整链路: ai:chat 含源文件引用', () => {
    let tmpDir: string
    let tmpFile: string

    beforeAll(async () => {
      tmpDir = join(tmpdir(), `de-e2e-${Date.now()}`)
      await mkdir(tmpDir, { recursive: true })
      tmpFile = join(tmpDir, 'MyComp.tsx')
      const lines = Array.from({ length: 40 }, (_, i) => `// line ${i + 1}`)
      await writeFile(tmpFile, lines.join('\n'), 'utf-8')
    })

    afterAll(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    it('enriches message with file snippet when file exists', async () => {
      const { streamAIResponse } = await import('../../server/src/ai.js')
      const capturedMsgs: Array<{ role: string; content: string }> = []

      vi.mocked(streamAIResponse).mockImplementationOnce(
        async (
          _model: string,
          msgs: unknown,
          { onChunk, onDone }: { onChunk: (t: string) => void; onDone: () => void },
        ) => {
          capturedMsgs.push(...(msgs as Array<{ role: string; content: string }>))
          onChunk('ok')
          onDone()
        },
      )

      const ws = await wsConnect(server.wsUrl)
      const done = new Promise<void>((resolve) => {
        ws.on('message', (raw) => {
          if ((JSON.parse(raw.toString()) as { type: string }).type === 'ai:done') resolve()
        })
      })

      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-e2e-file',
        messages: [{ role: 'user', content: `修改组件 源文件：\`${tmpFile}:20\`` }],
      })

      await done
      ws.close()

      // First message content should contain the injected snippet
      expect(capturedMsgs[0]?.content).toContain('源码片段')
      expect(capturedMsgs[0]?.content).toContain('// line')
    })

    it('continues without enrichment when file does not exist', async () => {
      const { streamAIResponse } = await import('../../server/src/ai.js')
      const capturedMsgs: Array<{ role: string; content: string }> = []

      vi.mocked(streamAIResponse).mockImplementationOnce(
        async (
          _model: string,
          msgs: unknown,
          { onChunk, onDone }: { onChunk: (t: string) => void; onDone: () => void },
        ) => {
          capturedMsgs.push(...(msgs as Array<{ role: string; content: string }>))
          onChunk('ok')
          onDone()
        },
      )

      const ws = await wsConnect(server.wsUrl)
      const done = new Promise<void>((resolve) => {
        ws.on('message', (raw) => {
          if ((JSON.parse(raw.toString()) as { type: string }).type === 'ai:done') resolve()
        })
      })

      wsSend(ws, {
        type: 'ai:chat',
        requestId: 'req-e2e-nofile',
        messages: [{ role: 'user', content: '源文件：`/nonexistent/Missing.tsx:1`' }],
      })

      await done
      ws.close()

      // Content should be the original (no snippet injected, no crash)
      expect(capturedMsgs[0]?.content).not.toContain('源码片段')
      expect(capturedMsgs[0]?.content).toContain('/nonexistent/Missing.tsx')
    })
  })

  // ── 多客户端并发: requestId 不混淆 ────────────────────────────────────────
  describe('多客户端并发: requestId 不混淆', () => {
    it('two concurrent ai:chat streams — each client only receives its own requestId', async () => {
      const ws1 = await wsConnect(server.wsUrl)
      const ws2 = await wsConnect(server.wsUrl)

      const received1: Array<{ type: string; requestId?: string }> = []
      const received2: Array<{ type: string; requestId?: string }> = []

      const done1 = new Promise<void>((resolve) => {
        ws1.on('message', (raw) => {
          const msg = JSON.parse(raw.toString()) as { type: string; requestId?: string }
          received1.push(msg)
          if (msg.type === 'ai:done') resolve()
        })
      })
      const done2 = new Promise<void>((resolve) => {
        ws2.on('message', (raw) => {
          const msg = JSON.parse(raw.toString()) as { type: string; requestId?: string }
          received2.push(msg)
          if (msg.type === 'ai:done') resolve()
        })
      })

      wsSend(ws1, {
        type: 'ai:chat',
        requestId: 'concurrent-1',
        messages: [{ role: 'user', content: 'from client 1' }],
      })
      wsSend(ws2, {
        type: 'ai:chat',
        requestId: 'concurrent-2',
        messages: [{ role: 'user', content: 'from client 2' }],
      })

      await Promise.all([done1, done2])
      ws1.close()
      ws2.close()

      // Each final ai:done carries the correct requestId
      const done1Msg = received1.find((m) => m.type === 'ai:done')
      const done2Msg = received2.find((m) => m.type === 'ai:done')
      expect(done1Msg?.requestId).toBe('concurrent-1')
      expect(done2Msg?.requestId).toBe('concurrent-2')

      // No cross-contamination: every tagged message has the correct id
      expect(received1.filter((m) => m.requestId).every((m) => m.requestId === 'concurrent-1')).toBe(true)
      expect(received2.filter((m) => m.requestId).every((m) => m.requestId === 'concurrent-2')).toBe(true)
    })
  })

  // ── Edge: 端口占用 ─────────────────────────────────────────────────────────
  describe('Edge: 端口被占用时监听失败', () => {
    it('emits EADDRINUSE error when port is already occupied', async () => {
      const http = await import('node:http')

      // Occupy a random port
      const blocker = http.createServer()
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()))
      const port = (blocker.address() as AddressInfo).port

      // A second plain http server on the same port should fail with EADDRINUSE
      const candidate = http.createServer()
      const listenError = new Promise<Error>((resolve) => {
        candidate.once('error', (err: Error) => resolve(err))
      })
      candidate.listen(port, '127.0.0.1')
      const err = await listenError

      expect(err.message).toMatch(/EADDRINUSE/)

      candidate.close()
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    })
  })

  // ── Edge: WS 断开后服务不 crash ────────────────────────────────────────────
  describe('Edge: WS 客户端断开后服务端不 crash', () => {
    it('server remains functional after abrupt client disconnect', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'ping' })
      ws.terminate() // forceful close, no clean handshake
      await new Promise((r) => setTimeout(r, 100))

      // Server still alive
      const res = await fetch(`${server.baseUrl}/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true })
    })
  })

  // ── Edge: 高频 ping 不崩溃 ─────────────────────────────────────────────────
  describe('Edge: 高频 ping（100次）服务不崩溃', () => {
    it('handles 100 rapid pings and returns 100 pongs', async () => {
      const ws = await wsConnect(server.wsUrl)

      let pongCount = 0
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string }
        if (msg.type === 'pong') pongCount++
      })

      for (let i = 0; i < 100; i++) {
        wsSend(ws, { type: 'ping' })
      }

      await new Promise((r) => setTimeout(r, 500))
      expect(pongCount).toBe(100)
      ws.close()
    })
  })
})
