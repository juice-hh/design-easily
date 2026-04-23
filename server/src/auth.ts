/**
 * Session-token auth for the local HTTP API.
 * A fresh random token is generated each time the server starts and written
 * to ~/.design-easily/session-token (mode 0o600) so the MCP process can read
 * it from disk without any manual configuration.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Request, Response, NextFunction } from 'express'

const TOKEN_DIR = join(homedir(), '.design-easily')
export const TOKEN_FILE = join(TOKEN_DIR, 'session-token')

export const sessionToken: string = (() => {
  const token = randomBytes(32).toString('hex')
  try {
    mkdirSync(TOKEN_DIR, { recursive: true })
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 })
  } catch (err) {
    process.stderr.write(`[auth] warning: could not persist session token: ${err}\n`)
  }
  return token
})()

export function readPersistedToken(): string | null {
  try {
    const val = readFileSync(TOKEN_FILE, 'utf8').trim()
    return val.length > 0 ? val : null
  } catch {
    return null
  }
}

export function tokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization']
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (token !== sessionToken) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }
  next()
}
