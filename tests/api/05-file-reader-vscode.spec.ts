// Source: specs/01-server-ws-test-plan.md — file utilities coverage

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── fileReader tests ──────────────────────────────────────────────────────────

describe('fileReader', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(async () => {
    vi.resetModules()
    tmpDir = join(tmpdir(), `de-test-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    tmpFile = join(tmpDir, 'TestComp.tsx')
    // 50 lines of content
    const lines = Array.from({ length: 50 }, (_, i) => `// line ${i + 1}`)
    await writeFile(tmpFile, lines.join('\n'), 'utf-8')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns null for a non-existent file', async () => {
    const { readFileContext } = await import('../../server/src/fileReader.js')
    const result = await readFileContext('/non/existent/file.tsx', 1)
    expect(result).toBeNull()
  })

  it('returns a FileContext with snippet for an existing file', async () => {
    const { readFileContext } = await import('../../server/src/fileReader.js')
    const result = await readFileContext(tmpFile, 25)
    expect(result).not.toBeNull()
    expect(result!.file).toBe(tmpFile)
    expect(result!.line).toBe(25)
    expect(typeof result!.snippet).toBe('string')
    expect(result!.snippet.length).toBeGreaterThan(0)
  })

  it('detects tsx language from file extension', async () => {
    const { readFileContext } = await import('../../server/src/fileReader.js')
    const result = await readFileContext(tmpFile, 1)
    expect(result!.language).toBe('tsx')
  })

  it('detects js language for .js files', async () => {
    const jsFile = join(tmpDir, 'util.js')
    await writeFile(jsFile, '// js file', 'utf-8')
    const { readFileContext } = await import('../../server/src/fileReader.js')
    const result = await readFileContext(jsFile, 1)
    expect(result!.language).toBe('javascript')
  })

  it('clamps snippet start to line 0 when line is small', async () => {
    const { readFileContext } = await import('../../server/src/fileReader.js')
    // Line 1 — start cannot go negative
    const result = await readFileContext(tmpFile, 1)
    expect(result).not.toBeNull()
    expect(result!.snippet).toContain('// line 1')
  })

  it('returns null when readFile throws (fileReader.ts:48)', async () => {
    vi.resetModules()
    vi.doMock('node:fs', () => ({ existsSync: () => true }))
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
    }))

    const { readFileContext } = await import('../../server/src/fileReader.js')
    const result = await readFileContext('/protected/file.tsx', 1)
    expect(result).toBeNull()

    vi.doUnmock('node:fs')
    vi.doUnmock('node:fs/promises')
  })

  it('returns text language for unknown extension', async () => {
    const unknownFile = join(tmpDir, 'data.xyz')
    await writeFile(unknownFile, 'hello', 'utf-8')
    const { readFileContext } = await import('../../server/src/fileReader.js')
    const result = await readFileContext(unknownFile, 1)
    expect(result!.language).toBe('text')
  })
})

// ── readFullFile tests ────────────────────────────────────────────────────────

describe('readFullFile', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(async () => {
    vi.resetModules()
    tmpDir = join(tmpdir(), `de-full-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    tmpFile = join(tmpDir, 'Comp.tsx')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns null for a non-existent file', async () => {
    const { readFullFile } = await import('../../server/src/fileReader.js')
    const result = await readFullFile('/no/such/file.tsx')
    expect(result).toBeNull()
  })

  it('returns content, language, totalLines, truncated:false for a normal file', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `// line ${i + 1}`)
    await writeFile(tmpFile, lines.join('\n'), 'utf-8')
    const { readFullFile } = await import('../../server/src/fileReader.js')
    const result = await readFullFile(tmpFile)
    expect(result).not.toBeNull()
    expect(result!.file).toBe(tmpFile)
    expect(result!.language).toBe('tsx')
    expect(result!.totalLines).toBe(10)
    expect(result!.truncated).toBe(false)
    expect(result!.content).toContain('// line 1')
  })

  it('truncates content and sets truncated:true when file exceeds 2000 lines', async () => {
    const lines = Array.from({ length: 2050 }, (_, i) => `// line ${i + 1}`)
    await writeFile(tmpFile, lines.join('\n'), 'utf-8')
    const { readFullFile } = await import('../../server/src/fileReader.js')
    const result = await readFullFile(tmpFile)
    expect(result).not.toBeNull()
    expect(result!.truncated).toBe(true)
    expect(result!.totalLines).toBe(2050)
    expect(result!.content).not.toContain('// line 2001')
  })

  it('returns null when readFile throws', async () => {
    vi.resetModules()
    vi.doMock('node:fs', () => ({ existsSync: () => true }))
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(new Error('EACCES: permission denied')),
    }))
    const { readFullFile } = await import('../../server/src/fileReader.js')
    const result = await readFullFile('/protected/file.tsx')
    expect(result).toBeNull()
    vi.doUnmock('node:fs')
    vi.doUnmock('node:fs/promises')
  })
})

// ── vscode tests ──────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

describe('openInVSCode', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('resolves when execFile succeeds', async () => {
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation((_cmd, _args, cb) => {
      (cb as (err: null) => void)?.(null)
      return {} as ReturnType<typeof execFile>
    })
    const { openInVSCode } = await import('../../server/src/vscode.js')
    await expect(openInVSCode('/src/App.tsx', 42)).resolves.toBeUndefined()
  })

  it('rejects with a descriptive error when execFile fails', async () => {
    const { execFile } = await import('node:child_process')
    vi.mocked(execFile).mockImplementation((_cmd, _args, cb) => {
      (cb as (err: Error) => void)?.(new Error('command not found: code'))
      return {} as ReturnType<typeof execFile>
    })
    const { openInVSCode } = await import('../../server/src/vscode.js')
    await expect(openInVSCode('/src/App.tsx', 10)).rejects.toThrow('Failed to open VS Code')
  })

  it('passes correct --goto args to execFile', async () => {
    const { execFile } = await import('node:child_process')
    let capturedArgs: string[] = []
    vi.mocked(execFile).mockImplementation((_cmd, args, cb) => {
      capturedArgs = args as string[]
      ;(cb as (err: null) => void)?.(null)
      return {} as ReturnType<typeof execFile>
    })
    const { openInVSCode } = await import('../../server/src/vscode.js')
    await openInVSCode('/src/MyComp.tsx', 99)
    expect(capturedArgs).toEqual(['--goto', '/src/MyComp.tsx:99'])
  })

  it('rejects for non-absolute paths', async () => {
    const { openInVSCode } = await import('../../server/src/vscode.js')
    await expect(openInVSCode('relative/path.tsx', 1)).rejects.toThrow('Invalid file path')
  })
})
