import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  startTestServer,
  teardownTestServer,
  wsConnect,
  waitForMessage,
  wsSend,
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

describe('06 — Design Queue', () => {
  describe('WS: design:request → design:queued', () => {
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

  describe('GET /api/next', () => {
    it('uses default 30 s timeout when no ?timeout param (app.ts:59)', async () => {
      queue._resetForTest()
      const ELEM2 = { tag: 'span', id: 'default-to', classList: [], textContent: '', computedStyles: {} }
      queue.enqueue(ELEM2, 'default-timeout-msg') // pre-populate so we don't wait 30 s
      const res = await fetch(`${server.baseUrl}/api/next`) // no ?timeout param
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
      expect(body.ok).toBe(true)
      expect(body.request?.userMessage).toBe('default-timeout-msg')
    })

    it('returns { ok: true, request: null } when queue is empty (short timeout)', async () => {
      const res = await fetch(`${server.baseUrl}/api/next?timeout=50`)
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; request: unknown }
      expect(body.ok).toBe(true)
      expect(body.request).toBeNull()
    })

    it('returns and claims the queued request', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'change font' })
      await waitForMessage(ws) // design:queued

      const res = await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
      expect(body.ok).toBe(true)
      expect(body.request?.userMessage).toBe('change font')
      expect(body.request?.status).toBe('claimed')
      ws.close()
    })

    it('preserves action field in dequeued request', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test', action: 'suggest' })
      await waitForMessage(ws) // design:queued

      const res = await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
      expect(body.request?.action).toBe('suggest')
      ws.close()
    })

    it('pushes design:processing to browser when request is claimed', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'fix padding' })
      await waitForMessage(ws) // design:queued

      const messages: Record<string, unknown>[] = []
      ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

      await fetch(`${server.baseUrl}/api/next?timeout=1000`)

      // Allow time for WS push
      await new Promise((r) => setTimeout(r, 100))
      const processing = messages.find((m) => m['type'] === 'design:processing')
      expect(processing).toBeDefined()
      ws.close()
    })
  })

  describe('POST /api/complete/:id', () => {
    async function enqueueAndClaim(): Promise<string> {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      ws.close()
      await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      return queued['id'] as string
    }

    it('marks request completed and returns { ok: true }', async () => {
      const id = await enqueueAndClaim()
      const res = await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', summary: 'done', changedFiles: ['A.tsx'] }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean }
      expect(body.ok).toBe(true)
      expect(queue.getById(id)?.status).toBe('completed')
    })

    it('returns 400 when status field is missing entirely (app.ts:86-87)', async () => {
      const id = await enqueueAndClaim()
      const res = await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'done but no status' }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toMatch(/status is required/)
    })

    it('returns 400 when status is failed but error is missing', async () => {
      const id = await enqueueAndClaim()
      const res = await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for unknown id', async () => {
      const res = await fetch(`${server.baseUrl}/api/complete/does-not-exist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed', error: 'oops' }),
      })
      expect(res.status).toBe(404)
    })

    it('returns ok:true and skips WS push when request already completed (app.ts:102 false)', async () => {
      const id = await enqueueAndClaim()
      // First complete succeeds
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      // Second complete — queue.complete returns false (already completed)
      const res = await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      expect(res.status).toBe(200)
      expect((await res.json() as { ok: boolean }).ok).toBe(true)
    })

    it('pushes design:failed when status is failed with error (app.ts:103 false branch)', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'fail me' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string

      await fetch(`${server.baseUrl}/api/next?timeout=1000`)

      const messages: Record<string, unknown>[] = []
      ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed', error: 'AI failed hard' }),
      })

      await new Promise((r) => setTimeout(r, 100))
      const failed = messages.find((m) => m['type'] === 'design:failed')
      expect(failed?.['error']).toBe('AI failed hard')
      ws.close()
    })

    it('pushes design:done to browser on completion', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string

      await fetch(`${server.baseUrl}/api/next?timeout=1000`)

      const messages: Record<string, unknown>[] = []
      ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', summary: 'Fixed', changedFiles: ['B.tsx'] }),
      })

      await new Promise((r) => setTimeout(r, 100))
      const done = messages.find((m) => m['type'] === 'design:done')
      expect(done?.['summary']).toBe('Fixed')
      expect(done?.['changedFiles']).toEqual(['B.tsx'])
      ws.close()
    })

    it('pushes design:done with action and content for suggest mode', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test', action: 'suggest' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string

      await fetch(`${server.baseUrl}/api/next?timeout=1000`)

      const messages: Record<string, unknown>[] = []
      ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', content: 'Use border-radius: 8px' }),
      })

      await new Promise((r) => setTimeout(r, 100))
      const done = messages.find((m) => m['type'] === 'design:done')
      expect(done?.['action']).toBe('suggest')
      expect(done?.['content']).toBe('Use border-radius: 8px')
      ws.close()
    })
  })

  describe('queue.ts: complete() with unknown id (line 109)', () => {
    it('returns false when id does not exist in the map', () => {
      queue._resetForTest()
      const result = queue.complete('does-not-exist', { status: 'completed' })
      expect(result).toBe(false)
    })
  })

  describe('queue.ts: cleanupStale() marks old in-flight items as failed (lines 139-141)', () => {
    it('marks stale claimed request as failed and removes from inFlight', () => {
      queue._resetForTest()
      const ELEM = { tag: 'div', id: 'stale', classList: [], textContent: '', computedStyles: {} }
      const req = queue.enqueue(ELEM, 'stale message')
      queue._addToInFlight(req.id, 0) // epoch 0 → definitely stale
      queue._runCleanupForTest()
      expect(queue.getById(req.id)?.status).toBe('failed')
      expect(queue.getById(req.id)?.error).toBe('timed out')
    })

    it('skips recent items (line 139 false branch)', () => {
      queue._resetForTest()
      const ELEM = { tag: 'div', id: 'fresh', classList: [], textContent: '', computedStyles: {} }
      const req = queue.enqueue(ELEM, 'fresh message')
      queue._addToInFlight(req.id, Date.now()) // recent → not stale
      queue._runCleanupForTest()
      expect(queue.getById(req.id)?.status).not.toBe('failed')
    })

    it('handles orphan inFlight id not in requestsById (line 141 false branch)', () => {
      queue._resetForTest()
      queue._addToInFlight('ghost-id', 0) // stale but no matching request
      queue._runCleanupForTest() // should not crash
      expect(queue.getAll()).toHaveLength(0)
    })

    it('interval callback triggers cleanupStale (covers setInterval arrow fn)', async () => {
      vi.useFakeTimers()
      vi.resetModules()
      const { queue: freshQueue } = await import('../../server/src/queue.js')
      const ELEM = { tag: 'div', id: 'timer-test', classList: [], textContent: '', computedStyles: {} }
      const req = freshQueue.enqueue(ELEM, 'timer msg')
      freshQueue._addToInFlight(req.id, 0) // stale
      vi.advanceTimersByTime(61_000) // past CLEANUP_INTERVAL_MS (60_000)
      expect(freshQueue.getById(req.id)?.status).toBe('failed')
      vi.useRealTimers()
    })
  })

  describe('GET /api/next: no connected clients (app.ts:65 false branch)', () => {
    it('sends 200 with request even when all WS clients are disconnected', async () => {
      queue._resetForTest()
      // Enqueue via a WS then close it before /api/next is called
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'orphan msg' })
      await waitForMessage(ws) // design:queued
      ws.close()
      await new Promise((r) => setTimeout(r, 150)) // let close propagate

      const res = await fetch(`${server.baseUrl}/api/next?timeout=500`)
      const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
      expect(body.ok).toBe(true)
      expect(body.request?.userMessage).toBe('orphan msg')
    })
  })

  describe('queue.ts dequeue race window (line 91)', () => {
    it('resolves null when onEnqueue fires but pending is already empty', async () => {
      queue._resetForTest()

      // Two concurrent dequeue calls — both register once('enqueue') handlers
      const p1 = queue.dequeue(5000)
      const p2 = queue.dequeue(5000)

      // Enqueue one item: emit fires both handlers in registration order.
      // p1 claims the item first; p2 finds pending empty → resolves null (line 91).
      const ELEM = { tag: 'div', id: 'race', classList: [], textContent: '', computedStyles: {} }
      queue.enqueue(ELEM, 'race-msg')

      const [r1, r2] = await Promise.all([p1, p2])
      const claimed = [r1, r2].filter(Boolean)
      const nulls = [r1, r2].filter((r) => r === null)
      expect(claimed.length).toBe(1)
      expect(nulls.length).toBe(1)
    })
  })

  describe('GET /api/requests/:id', () => {
    it('returns full request status by id', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'status test' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string
      ws.close()

      const res = await fetch(`${server.baseUrl}/api/requests/${id}`)
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body['id']).toBe(id)
      expect(body['status']).toBe('pending')
      expect(body['createdAt']).toBeTypeOf('number')
    })

    it('returns 404 for unknown id', async () => {
      const res = await fetch(`${server.baseUrl}/api/requests/nonexistent`)
      expect(res.status).toBe(404)
    })

    it('returns action and content after suggest-mode completion', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test', action: 'suggest' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string
      ws.close()

      await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', content: 'Add padding: 16px' }),
      })

      const res = await fetch(`${server.baseUrl}/api/requests/${id}`)
      const body = await res.json() as Record<string, unknown>
      expect(body['action']).toBe('suggest')
      expect(body['content']).toBe('Add padding: 16px')
    })
  })

  describe('queue.cancel(id)', () => {
    it('cancels a pending request — status becomes failed with 用户取消', () => {
      queue._resetForTest()
      const ELEM = { tag: 'div', id: 'cancel-me', classList: [], textContent: '', computedStyles: {} }
      const req = queue.enqueue(ELEM, 'cancel test')
      const result = queue.cancel(req.id)
      expect(result).toBe(true)
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

    it('removes the request from the pending queue so /api/next will not return it', async () => {
      queue._resetForTest()
      const ELEM = { tag: 'div', id: 'removed', classList: [], textContent: '', computedStyles: {} }
      const req = queue.enqueue(ELEM, 'should vanish')
      queue.cancel(req.id)

      const res = await fetch(`${server.baseUrl}/api/next?timeout=50`)
      const body = await res.json() as { ok: boolean; request: unknown }
      expect(body.ok).toBe(true)
      expect(body.request).toBeNull()
    })
  })

  describe('design:done noChanges flag', () => {
    async function enqueueAndClaimViaWs(): Promise<{ ws: InstanceType<typeof import('ws').WebSocket>; id: string }> {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'noChanges test', action: 'suggest' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string
      await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      return { ws, id }
    }

    it('sets noChanges to true when changedFiles is empty array', async () => {
      const { ws, id } = await enqueueAndClaimViaWs()
      const pending = waitForMessage(ws)
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', summary: 'no changes', changedFiles: [] }),
      })
      const done = await pending as Record<string, unknown>
      expect(done['type']).toBe('design:done')
      expect(done['noChanges']).toBe(true)
      ws.close()
    })

    it('sets noChanges to false when changedFiles has entries', async () => {
      const { ws, id } = await enqueueAndClaimViaWs()
      const pending = waitForMessage(ws)
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', summary: 'changed', changedFiles: ['A.tsx'] }),
      })
      const done = await pending as Record<string, unknown>
      expect(done['type']).toBe('design:done')
      expect(done['noChanges']).toBe(false)
      ws.close()
    })

    it('sets noChanges to true when changedFiles is not provided', async () => {
      const { ws, id } = await enqueueAndClaimViaWs()
      const pending = waitForMessage(ws)
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', summary: 'nothing' }),
      })
      const done = await pending as Record<string, unknown>
      expect(done['type']).toBe('design:done')
      expect(done['noChanges']).toBe(true)
      ws.close()
    })
  })

  describe('pageUrl pass-through', () => {
    it('includes pageUrl in request when sent via WS design:request', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, {
        type: 'design:request',
        element: ELEMENT,
        userMessage: 'pageUrl test',
        pageUrl: 'http://localhost:3000/settings',
      })
      await waitForMessage(ws) // design:queued

      const res = await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
      expect(body.ok).toBe(true)
      expect(body.request?.pageUrl).toBe('http://localhost:3000/settings')
      ws.close()
    })

    it('pageUrl is undefined when not sent in WS design:request', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, {
        type: 'design:request',
        element: ELEMENT,
        userMessage: 'no pageUrl test',
      })
      await waitForMessage(ws) // design:queued

      const res = await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
      expect(body.ok).toBe(true)
      expect(body.request?.pageUrl).toBeUndefined()
      ws.close()
    })
  })

  describe('WS design:cancel dispatches to queue.cancel()', () => {
    it('cancels a pending non-develop request via WS design:cancel', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'cancel via ws', action: 'suggest' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string

      wsSend(ws, { type: 'design:cancel', id })

      // Allow time for the cancel to process
      await new Promise((r) => setTimeout(r, 100))

      expect(queue.getById(id)?.status).toBe('failed')
      expect(queue.getById(id)?.error).toBe('用户取消')
      ws.close()
    })

    // Fix 5: cancel race — cancel before setImmediate runner is registered must broadcast design:failed
    it('broadcasts design:failed when cancel arrives before runner is claimed', async () => {
      const ws = await wsConnect(server.wsUrl)

      // Collect all messages so we can find design:failed
      const messages: Record<string, unknown>[] = []
      ws.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString())))

      wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'cancel-race', action: 'suggest' })

      // Wait for queued so we have the id, then immediately cancel before setImmediate fires
      await new Promise<void>((resolve) => {
        const check = (): void => {
          const q = messages.find((m) => m['type'] === 'design:queued')
          if (q) { resolve(); return }
          setTimeout(check, 10)
        }
        check()
      })

      const id = messages.find((m) => m['type'] === 'design:queued')?.['id'] as string

      // Cancel synchronously — setImmediate hasn't fired yet
      wsSend(ws, { type: 'design:cancel', id })

      await new Promise((r) => setTimeout(r, 150))

      const failed = messages.find((m) => m['type'] === 'design:failed')
      expect(failed).toBeDefined()
      expect(failed?.['id']).toBe(id)
      expect(failed?.['error']).toBe('用户取消')
      ws.close()
    })
  })

  // Fix 6: configPanel submit with null element — full queued→done flow
  describe('design:request with null element (configPanel batch submit)', () => {
    it('returns design:queued when element is null', async () => {
      const ws = await wsConnect(server.wsUrl)
      const reply = waitForMessage(ws)
      wsSend(ws, { type: 'design:request', element: null, userMessage: '把按钮改成蓝色' })
      const msg = await reply as Record<string, unknown>
      expect(msg.type).toBe('design:queued')
      expect(typeof msg.id).toBe('string')
      ws.close()
    })

    it('stores null element in queue and enqueues the request', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: null, userMessage: 'batch submit test' })
      await waitForMessage(ws) // design:queued
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

      wsSend(ws, { type: 'design:request', element: null, userMessage: 'batch done' })

      // Wait for queued
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (messages.some((m) => m['type'] === 'design:queued')) { resolve(); return }
          setTimeout(check, 10)
        }
        check()
      })
      const id = messages.find((m) => m['type'] === 'design:queued')?.['id'] as string

      // Claim then complete
      await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
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

    it('/api/requests/:id returns full terminal state after completion', async () => {
      const ws = await wsConnect(server.wsUrl)
      wsSend(ws, { type: 'design:request', element: null, userMessage: 'recovery test' })
      const queued = await waitForMessage(ws) as Record<string, unknown>
      const id = queued['id'] as string
      ws.close()

      await fetch(`${server.baseUrl}/api/next?timeout=1000`)
      await fetch(`${server.baseUrl}/api/complete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', summary: '持久化测试', changedFiles: ['A.tsx', 'B.tsx'] }),
      })

      const res = await fetch(`${server.baseUrl}/api/requests/${id}`)
      const body = await res.json() as Record<string, unknown>
      expect(body['status']).toBe('completed')
      expect(body['summary']).toBe('持久化测试')
      expect(body['changedFiles']).toEqual(['A.tsx', 'B.tsx'])
      expect(body['completedAt']).toBeTypeOf('number')
    })
  })
})
