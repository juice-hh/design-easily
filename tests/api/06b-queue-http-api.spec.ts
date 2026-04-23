// HTTP API: GET /api/next, POST /api/complete/:id, GET /api/requests/:id

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

// Helper: enqueue a 'suggest' request via WS, then claim it via GET /api/next.
async function enqueueAndClaim(): Promise<string> {
  const ws = await wsConnect(server.wsUrl)
  wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test', action: 'suggest' })
  const queued = await waitForMessage(ws) as Record<string, unknown>
  ws.close()
  await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
  return queued['id'] as string
}

describe('06b — GET /api/next', () => {
  it('uses default 30 s timeout when no ?timeout param', async () => {
    queue._resetForTest()
    const ELEM2 = { tag: 'span', id: 'default-to', classList: [], textContent: '', computedStyles: {} }
    queue.enqueue(ELEM2, 'default-timeout-msg', 'suggest')
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.request?.userMessage).toBe('default-timeout-msg')
  })

  it('returns { ok: true, request: null } when queue is empty (short timeout)', async () => {
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=50`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; request: unknown }
    expect(body.ok).toBe(true)
    expect(body.request).toBeNull()
  })

  it('returns and claims the queued request', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'change font', action: 'suggest' })
    await waitForMessage(ws)

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.request?.userMessage).toBe('change font')
    expect(body.request?.status).toBe('claimed')
    ws.close()
  })

  it('preserves action field in dequeued request', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test', action: 'suggest' })
    await waitForMessage(ws)

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
    expect(body.request?.action).toBe('suggest')
    ws.close()
  })

  it('pushes design:processing to browser when request is claimed', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'fix padding', action: 'suggest' })
    await waitForMessage(ws)

    const messages: Record<string, unknown>[] = []
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    await new Promise((r) => setTimeout(r, 100))

    expect(messages.find((m) => m['type'] === 'design:processing')).toBeDefined()
    ws.close()
  })

  it('sends 200 with request even when all WS clients are disconnected', async () => {
    queue._resetForTest()
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'orphan msg', action: 'suggest' })
    await waitForMessage(ws)
    ws.close()
    await new Promise((r) => setTimeout(r, 150))

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=500`)
    const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.request?.userMessage).toBe('orphan msg')
  })

  it('includes pageUrl when sent via WS design:request', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'pageUrl test', pageUrl: 'http://localhost:3000/settings', action: 'suggest' })
    await waitForMessage(ws)

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
    expect(body.request?.pageUrl).toBe('http://localhost:3000/settings')
    ws.close()
  })

  it('pageUrl is undefined when not sent', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'no pageUrl test', action: 'suggest' })
    await waitForMessage(ws)

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const body = await res.json() as { ok: boolean; request: Record<string, unknown> }
    expect(body.request?.pageUrl).toBeUndefined()
    ws.close()
  })
})

describe('06b — POST /api/complete/:id', () => {
  it('marks request completed and returns { ok: true }', async () => {
    const id = await enqueueAndClaim()
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', summary: 'done', changedFiles: ['A.tsx'] }),
    })
    expect(res.status).toBe(200)
    expect((await res.json() as { ok: boolean }).ok).toBe(true)
    expect(queue.getById(id)?.status).toBe('completed')
  })

  it('returns 400 when status field is missing', async () => {
    const id = await enqueueAndClaim()
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
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
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/complete/does-not-exist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', error: 'oops' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns ok:true and skips WS push when request already completed', async () => {
    const id = await enqueueAndClaim()
    const body = { status: 'completed' }
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    expect((await res.json() as { ok: boolean }).ok).toBe(true)
  })

  it('pushes design:failed when status is failed', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'fail me' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', error: 'AI failed hard' }),
    })
    await new Promise((r) => setTimeout(r, 100))

    expect(messages.find((m) => m['type'] === 'design:failed')?.['error']).toBe('AI failed hard')
    ws.close()
  })

  it('pushes design:done on completion', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
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

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    const messages: Record<string, unknown>[] = []
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))

    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
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

describe('06b — GET /api/requests/:id', () => {
  it('returns full request status by id', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'status test' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string
    ws.close()

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/requests/${id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body['id']).toBe(id)
    expect(body['status']).toBe('pending')
    expect(body['createdAt']).toBeTypeOf('number')
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/requests/nonexistent`)
    expect(res.status).toBe(404)
  })

  it('returns action and content after suggest-mode completion', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'test', action: 'suggest' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string
    ws.close()

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', content: 'Add padding: 16px' }),
    })

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/requests/${id}`)
    const body = await res.json() as Record<string, unknown>
    expect(body['action']).toBe('suggest')
    expect(body['content']).toBe('Add padding: 16px')
  })

  it('returns full terminal state after completion', async () => {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: null, userMessage: 'recovery test', action: 'suggest' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string
    ws.close()

    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', summary: '持久化测试', changedFiles: ['A.tsx', 'B.tsx'] }),
    })

    const res = await fetchWithToken(server.token, `${server.baseUrl}/api/requests/${id}`)
    const body = await res.json() as Record<string, unknown>
    expect(body['status']).toBe('completed')
    expect(body['summary']).toBe('持久化测试')
    expect(body['changedFiles']).toEqual(['A.tsx', 'B.tsx'])
    expect(body['completedAt']).toBeTypeOf('number')
  })
})

describe('06b — design:done noChanges flag', () => {
  async function enqueueAndClaimViaWs(): Promise<{ ws: InstanceType<typeof import('ws').WebSocket>; id: string }> {
    const ws = await wsConnect(server.wsUrl)
    wsSend(ws, { type: 'design:request', element: ELEMENT, userMessage: 'noChanges test', action: 'suggest' })
    const queued = await waitForMessage(ws) as Record<string, unknown>
    const id = queued['id'] as string
    await fetchWithToken(server.token, `${server.baseUrl}/api/next?timeout=1000`)
    return { ws, id }
  }

  it('sets noChanges to true when changedFiles is empty array', async () => {
    const { ws, id } = await enqueueAndClaimViaWs()
    const pending = waitForMessage(ws)
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
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
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', summary: 'changed', changedFiles: ['A.tsx'] }),
    })
    const done = await pending as Record<string, unknown>
    expect(done['noChanges']).toBe(false)
    ws.close()
  })

  it('sets noChanges to true when changedFiles is not provided', async () => {
    const { ws, id } = await enqueueAndClaimViaWs()
    const pending = waitForMessage(ws)
    await fetchWithToken(server.token, `${server.baseUrl}/api/complete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', summary: 'nothing' }),
    })
    const done = await pending as Record<string, unknown>
    expect(done['noChanges']).toBe(true)
    ws.close()
  })
})
