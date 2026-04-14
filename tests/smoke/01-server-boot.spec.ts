// Source: specs/01-server-ws-test-plan.md — Smoke

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startTestServer, teardownTestServer, type TestServer } from '../helpers/server-harness.js'

let server: TestServer

beforeAll(async () => {
  server = await startTestServer()
}, 10_000)

afterAll(async () => {
  await server?.close()
  teardownTestServer()
})

describe('Server boot smoke', () => {
  it('GET /health returns 200 with { ok: true }', async () => {
    const res = await fetch(`${server.baseUrl}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true })
  })
})
