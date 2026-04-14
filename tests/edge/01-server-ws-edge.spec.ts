// Source: specs/01-server-ws-test-plan.md — Edge Cases

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  startTestServer,
  teardownTestServer,
  wsConnect,
  waitForMessage,
  type TestServer,
} from '../helpers/server-harness.js'

vi.mock('../../server/src/vscode.js', () => ({
  openInVSCode: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/src/ai.js', () => ({
  streamAIResponse: vi.fn(),
}))

let server: TestServer

beforeAll(async () => {
  server = await startTestServer()
}, 10_000)

afterAll(async () => {
  await server?.close()
  teardownTestServer()
})

describe('01 — Server WS Edge Cases', () => {
  it('vscode:open with empty file does not call openInVSCode', async () => {
    const { openInVSCode } = await import('../../server/src/vscode.js')
    vi.mocked(openInVSCode).mockClear()

    const ws = await wsConnect(server.wsUrl)
    ws.send(JSON.stringify({ type: 'vscode:open', file: '', line: 1 }))
    await new Promise((r) => setTimeout(r, 150))
    expect(vi.mocked(openInVSCode)).not.toHaveBeenCalled()
    ws.close()
  })

  it('ai:chat with empty messages returns ai:error', async () => {
    const ws = await wsConnect(server.wsUrl)
    const reply = waitForMessage(ws)
    ws.send(JSON.stringify({ type: 'ai:chat', requestId: 'edge-1', messages: [] }))
    expect((await reply) as { type: string }).toMatchObject({ type: 'ai:error' })
    ws.close()
  })

  it('server survives WS disconnect mid-session', async () => {
    const ws = await wsConnect(server.wsUrl)
    ws.close()
    await new Promise((r) => setTimeout(r, 200))

    const ws2 = await wsConnect(server.wsUrl)
    const reply = waitForMessage(ws2)
    ws2.send(JSON.stringify({ type: 'ping' }))
    expect(await reply).toEqual({ type: 'pong' })
    ws2.close()
  })
})
