// WS design:request / design:cancel and null-element (configPanel batch) flows.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  startTestServer,
  teardownTestServer,
  wsConnect,
  waitForMessage,
  wsSend,
  fetchWithToken,
  type TestServer,
} from '../helpers/server-harness.js'
import { queue } from '../../server/src/queue.js'

let server: TestServer

beforeAll(async () => { server = await startTestServer() }, 10_000)
afterAll(async () => { await server?.close(); teardownTestServer() })
beforeEach(() => queue._resetForTest())

const ELEMENT = {
  tag: 'button',
  id: 'submit-btn',
  classList: ['btn', 'btn-primary'],
  textContent: 'Submit',
  computedStyles: { color: 'rgb(0,0,0)' },
}

describe('06a — Queue: WS enqueue', () => {
  it('returns design:queued with a server-generated id', async () => {
    const ws = await wsConnect(server.wsUrl)
    const reply = waitForMessage(ws)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'make it red' })
    const msg = await reply as Record<string, unknown>
    expect(msg.type).toBe('design:queued')
    expect(typeof msg.id).toBe('string')
    expect((msg.id as string).length).toBeGreaterThan(0)
    ws.close()
  })

  it('enqueues the request in the queue', async () => {
    const ws = await wsConnect(server.wsUrl)
    const reply = waitForMessage(ws)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'resize it' })
    await reply
    expect(queue.getAll().length).toBe(1)
    expect(queue.getAll()[0]?.userMessage).toBe('resize it')
    ws.close()
  })
})

describe('06a — Queue: WS design:cancel', () => {
  it('cancels a pending non-develop request via WS design:cancel', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'cancel via ws', action: 'suggest' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string

    wsSend(ws, { type: 'design:cancel', id })
    await new Promise((r) => setTimeout(r, 100))

    expect(queue.getById(id)?.status).toBe('failed')
    expect(queue.getById(id)?.error).toBe('用户取消')
    ws.close()
  })

  it('broadcasts design:failed when cancel arrives before runner is claimed', async () => {
    const ws = await wsConnect(server.wsUrl)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString())))

    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'cancel-race', action: 'suggest' })

    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (messages.some((m) => m['type'] === 'design:queued')) { resolve(); return }
        setTimeout(check, 10)
      }
      check()
    })

    const id = messages.find((m) => m['type'] === 'design:queued')?.['id'] as string
    wsSend(ws, { type: 'design:cancel', id })

    await new Promise((r) => setTimeout(r, 150))
    const failed = messages.find((m) => m['type'] === 'design:failed')
    expect(failed).toBeDefined()
    expect(failed?.['id']).toBe(id)
    expect(failed?.['error']).toBe('用户取消')
    ws.close()
  })
})

describe('06a — Queue: null element (configPanel batch submit)', () => {
  it('returns design:queued when element is null', async () => {
    const ws = await wsConnect(server.wsUrl)
    const reply = waitForMessage(ws)
    wsSend(ws, { type: 'design:request', element: null, userMessage: '把按钮改成蓝色' })
    const msg = await reply as Record<string, unknown>
    expect(msg.type).toBe('design:queued')
    expect(typeof msg.id).toBe('string')
    ws.close()
  })

  it('stores null element in queue', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: null, userMessage: 'batch submit test' })
    await waitForMessage(ws)
    const all = queue.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.element).toBeNull()
    expect(all[0]?.userMessage).toBe('batch submit test')
    ws.close()
  })

  it('design:done is broadcast with matching id after /api/complete', async () => {
    const ws = await wsConnect(server.wsUrl)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString())))

    wsSend(ws, { type: 'design:request', element: null, userMessage: 'batch done', action: 'suggest' })

    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (messages.some((m) => m['type'] === 'design:queued')) { resolve(); return }
        setTimeout(check, 10)
      }
      check()
    })
    const id = messages.find((m) => m['type'] === 'design:queued')?.['id'] as string

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', summary: '全部改完', changedFiles: ['Foo.tsx'] }),
    })

    await new Promise((r) => setTimeout(r, 100))
    const done = messages.find((m) => m['type'] === 'design:done')
    expect(done).toBeDefined()
    expect(done?.['id']).toBe(id)
    expect(done?.['summary']).toBe('全部改完')
    ws.close()
  })
})
