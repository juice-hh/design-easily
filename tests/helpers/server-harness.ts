/**
 * Shared test helpers for server-based tests.
 * Eliminates duplication across smoke, api, and edge test files.
 */

import { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import type { Server } from 'node:http'

export interface TestServer {
  baseUrl: string
  wsUrl: string
  close: () => Promise<void>
}

export async function startTestServer(): Promise<TestServer> {
  process.env['PORT'] = '0'
  const { default: createApp } = await import('../../server/src/app.js')
  const { httpServer }: { httpServer: Server } = createApp()

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()))

  const port = (httpServer.address() as AddressInfo).port
  const baseUrl = `http://127.0.0.1:${port}`
  const wsUrl = `ws://127.0.0.1:${port}`

  const close = (): Promise<void> =>
    new Promise<void>((resolve, reject) =>
      httpServer.close((err) => (err ? reject(err) : resolve())),
    )

  return { baseUrl, wsUrl, close }
}

export function teardownTestServer(): void {
  delete process.env['PORT']
}

export function wsConnect(wsUrl: string, timeoutMs = 3000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(
      () => reject(new Error('WS connect timeout')),
      timeoutMs,
    )
    ws.on('open', () => { clearTimeout(timer); resolve(ws) })
    ws.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

export function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('waitForMessage timed out')),
      timeoutMs,
    )
    ws.once('message', (raw) => {
      clearTimeout(timer)
      resolve(JSON.parse(raw.toString()))
    })
  })
}

export function wsSend(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg))
}
