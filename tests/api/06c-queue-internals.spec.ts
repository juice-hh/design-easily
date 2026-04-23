// queue.ts internal unit tests: complete(), cancel(), cleanupStale(), dequeue race.

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

describe('06c — queue.complete() with unknown id', () => {
  it('returns false when id does not exist in the map', () => {
    queue._resetForTest()
    expect(queue.complete('does-not-exist', { status: 'completed' })).toBe(false)
  })
})

describe('06c — queue.cleanupStale()', () => {
  it('marks stale claimed request as failed and removes from inFlight', () => {
    queue._resetForTest()
    const ELEM = { tag: 'div', id: 'stale', classList: [], textContent: '', computedStyles: {} }
    const req = queue.enqueue(ELEM, 'stale message')
    queue._addToInFlight(req.id, 0)
    queue._runCleanupForTest()
    expect(queue.getById(req.id)?.status).toBe('failed')
    expect(queue.getById(req.id)?.error).toBe('timed out')
  })

  it('skips recent items', () => {
    queue._resetForTest()
    const ELEM = { tag: 'div', id: 'fresh', classList: [], textContent: '', computedStyles: {} }
    const req = queue.enqueue(ELEM, 'fresh message')
    queue._addToInFlight(req.id, Date.now())
    queue._runCleanupForTest()
    expect(queue.getById(req.id)?.status).not.toBe('failed')
  })

  it('handles orphan inFlight id not in requestsById', () => {
    queue._resetForTest()
    queue._addToInFlight('ghost-id', 0)
    queue._runCleanupForTest()
    expect(queue.getAll()).toHaveLength(0)
  })

  it('interval callback triggers cleanupStale', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const { queue: freshQueue } = await import('../../server/src/queue.js')
    const ELEM = { tag: 'div', id: 'timer-test', classList: [], textContent: '', computedStyles: {} }
    const req = freshQueue.enqueue(ELEM, 'timer msg')
    freshQueue._addToInFlight(req.id, 0)
    vi.advanceTimersByTime(61_000)
    expect(freshQueue.getById(req.id)?.status).toBe('failed')
    vi.useRealTimers()
  })
})

describe('06c — queue.cancel(id)', () => {
  it('cancels a pending request — status becomes failed', () => {
    queue._resetForTest()
    const ELEM = { tag: 'div', id: 'cancel-me', classList: [], textContent: '', computedStyles: {} }
    const req = queue.enqueue(ELEM, 'cancel test')
    expect(queue.cancel(req.id)).toBe(true)
    expect(queue.getById(req.id)?.status).toBe('failed')
    expect(queue.getById(req.id)?.error).toBe('用户取消')
  })

  it('returns false for unknown id', () => {
    queue._resetForTest()
    expect(queue.cancel('nonexistent-id')).toBe(false)
  })

  it('returns false for already-completed request', () => {
    queue._resetForTest()
    const ELEM = { tag: 'div', id: 'done', classList: [], textContent: '', computedStyles: {} }
    const req = queue.enqueue(ELEM, 'already done')
    queue.complete(req.id, { status: 'completed', summary: 'done' })
    expect(queue.cancel(req.id)).toBe(false)
  })

  it('removes request from pending so /api/next will not return it', async () => {
    queue._resetForTest()
    const ELEM = { tag: 'div', id: 'removed', classList: [], textContent: '', computedStyles: {} }
    const req = queue.enqueue(ELEM, 'should vanish')
    queue.cancel(req.id)

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=50`)
    const body = await res.json() as { ok: boolean; request: unknown }
    expect(body.ok).toBe(true)
    expect(body.request).toBeNull()
  })
})

describe('06c — dequeue race window', () => {
  it('resolves null when onEnqueue fires but pending is already empty', async () => {
    queue._resetForTest()
    const p1 = queue.dequeue(5000)
    const p2 = queue.dequeue(5000)

    const ELEM = { tag: 'div', id: 'race', classList: [], textContent: '', computedStyles: {} }
    queue.enqueue(ELEM, 'race-msg', 'suggest')

    const [r1, r2] = await Promise.all([p1, p2])
    expect([r1, r2].filter(Boolean).length).toBe(1)
    expect([r1, r2].filter((r) => r === null).length).toBe(1)
  })
})

describe('06c — WS: design:request validation', () => {
  it('ignores design:request with empty userMessage', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: '' })
    await new Promise((r) => setTimeout(r, 100))
    expect(queue.getAll()).toHaveLength(0)
    ws.close()
  })

  it('ignores design:request with userMessage over 10000 chars', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'x'.repeat(10_001) })
    await new Promise((r) => setTimeout(r, 100))
    expect(queue.getAll()).toHaveLength(0)
    ws.close()
  })
})
