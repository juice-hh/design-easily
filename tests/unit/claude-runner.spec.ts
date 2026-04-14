// Source: 最新改动 — claude-runner/queue pageUrl + grep strategy
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DesignRequest, RequestStatus } from '../../server/src/queue.js'
import { EventEmitter } from 'node:events'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockSpawn, mockExecFileSync, mockExistsSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockExistsSync: vi.fn(() => true),
}))

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  execFileSync: mockExecFileSync,
}))

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}))

vi.mock('../../server/src/config.js', () => ({
  config: {
    workspacePath: '/fallback/workspace',
  },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeElement(overrides: Record<string, unknown> = {}) {
  return {
    tag: 'div',
    id: 'test',
    classList: ['px-4', 'text-[14px]', 'bg-white'],
    textContent: 'Hello',
    computedStyles: {},
    sourceFile: undefined as string | undefined,
    sourceLine: undefined as number | undefined,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<DesignRequest> = {}): DesignRequest {
  return {
    id: 'req-1',
    element: makeElement(),
    userMessage: 'make it red',
    action: 'develop',
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  } as DesignRequest
}

function makeMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    pid: number
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  proc.pid = 12345
  return proc
}

// ─── Import module under test (after mocks are set up) ──────────────────────

import { runClaudeOnRequest } from '../../server/src/claude-runner.js'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('claude-runner: runClaudeOnRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── resolveWorkspaceFromUrl (tested via observable behavior) ──────────────

  describe('workspace resolution from pageUrl (lsof path)', () => {
    it('uses lsof-discovered cwd when sourceFile is null and pageUrl is provided', () => {
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'lsof' && args[0] === '-ti') return '42\n'
        if (cmd === 'lsof' && args[0] === '-p' && args[1] === '42') {
          return 'node    42 user  cwd    DIR  1,5    512  /projects/my-app\n'
        }
        throw new Error('unexpected call')
      })

      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const req = makeRequest({
        pageUrl: 'http://localhost:3000/dashboard',
        element: makeElement({ sourceFile: undefined }),
      })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      expect(mockSpawn).toHaveBeenCalledOnce()
      expect(mockSpawn.mock.calls[0][2].cwd).toBe('/projects/my-app')
    })

    it('falls back to config.workspacePath when lsof fails (no port listener)', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('lsof: no matching process')
      })

      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const req = makeRequest({
        pageUrl: 'http://localhost:3000/page',
        element: makeElement({ sourceFile: undefined }),
      })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      expect(mockSpawn).toHaveBeenCalledOnce()
      expect(mockSpawn.mock.calls[0][2].cwd).toBe('/fallback/workspace')
    })

    it('falls back when lsof -p output has no cwd line', () => {
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'lsof' && args[0] === '-ti') return '99\n'
        if (cmd === 'lsof' && args[0] === '-p') {
          return 'node    99 user  txt    REG  1,5  12345 /usr/bin/node\n'
        }
        throw new Error('unexpected')
      })

      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const req = makeRequest({
        pageUrl: 'http://localhost:5173/',
        element: makeElement({ sourceFile: undefined }),
      })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      expect(mockSpawn.mock.calls[0][2].cwd).toBe('/fallback/workspace')
    })
  })

  // ── buildGrepPrompt (tested via prompt content passed to spawn) ──────────

  describe('grep prompt generation (sourceFile is null)', () => {
    beforeEach(() => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no lsof') })
    })

    it('includes component name search command when fiber.componentName is set', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const element = makeElement({
        sourceFile: undefined,
        classList: [],
        fiber: { componentName: 'UserCard' },
      })
      const req = makeRequest({ element: element as DesignRequest['element'] })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      const prompt = mockSpawn.mock.calls[0][1][1] as string
      expect(prompt).toContain('UserCard')
      expect(prompt).toContain('function UserCard')
    })

    it('includes distinctive class search when classList has bracket items', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const element = makeElement({
        sourceFile: undefined,
        classList: ['px-4', 'text-[14px]', 'bg-white'],
        fiber: { componentName: 'Card' },
      })
      const req = makeRequest({ element: element as DesignRequest['element'] })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      const prompt = mockSpawn.mock.calls[0][1][1] as string
      expect(prompt).toContain('text-[14px]')
    })

    it('includes only class search when componentName is absent', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const element = makeElement({
        sourceFile: undefined,
        classList: ['longclassname123'],
        fiber: undefined,
      })
      const req = makeRequest({ element: element as DesignRequest['element'] })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      const prompt = mockSpawn.mock.calls[0][1][1] as string
      expect(prompt).toContain('longclassname123')
      expect(prompt).toContain('源文件未找到')
    })

    it('handles no componentName and no classList gracefully', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const element = makeElement({
        sourceFile: undefined,
        classList: [],
        fiber: undefined,
      })
      const req = makeRequest({ element: element as DesignRequest['element'] })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      const prompt = mockSpawn.mock.calls[0][1][1] as string
      expect(prompt).toContain('源文件未找到')
      expect(prompt).toContain('grep -rE')
    })
  })

  // ── Process lifecycle ────────────────────────────────────────────────────

  describe('process close handling', () => {
    beforeEach(() => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no lsof') })
    })

    it('broadcasts design:done on successful close (exit code 0)', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const updateStatus = vi.fn()
      const complete = vi.fn()
      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx', sourceLine: 10 }),
      })

      runClaudeOnRequest(req, updateStatus, complete, broadcast)

      proc.stdout.emit('data', Buffer.from('修改完成\n'))
      proc.emit('close', 0)

      expect(complete).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'completed', summary: '修改完成' }))
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'design:done',
          id: 'req-1',
          action: 'develop',
          summary: '修改完成',
        }),
      )
    })

    it('broadcasts design:failed on non-zero exit code', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const updateStatus = vi.fn()
      const complete = vi.fn()
      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      runClaudeOnRequest(req, updateStatus, complete, broadcast)

      proc.stderr.emit('data', Buffer.from('Error: something broke'))
      proc.emit('close', 1)

      expect(complete).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'failed', error: expect.stringContaining('something broke') }))
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'design:failed',
          id: 'req-1',
          error: expect.stringContaining('something broke'),
        }),
      )
    })

    it('broadcasts design:failed on spawn error', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const complete = vi.fn()
      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      runClaudeOnRequest(req, vi.fn(), complete, broadcast)
      proc.emit('error', new Error('ENOENT: claude not found'))

      expect(complete).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'failed', error: expect.stringContaining('启动 Claude 失败') }))
      const failCall = broadcast.mock.calls.find((c) => c[0].type === 'design:failed')
      expect(failCall).toBeDefined()
      expect(failCall?.[0].error).toContain('启动 Claude 失败')
    })

    it('settle prevents duplicate broadcasts when close fires after error', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), broadcast)

      proc.emit('error', new Error('spawn failed'))
      proc.emit('close', 1)

      const failBroadcasts = broadcast.mock.calls.filter(
        (c) => c[0].type === 'design:failed',
      )
      // settle() ensures only the first event wins (error fires before close)
      expect(failBroadcasts).toHaveLength(1)
      expect(failBroadcasts[0]?.[0].error).toContain('启动 Claude 失败')
    })
  })

  // ── Timeout ──────────────────────────────────────────────────────────────

  describe('timeout mechanism', () => {
    beforeEach(() => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no lsof') })
    })

    it('kills process and broadcasts failure after CLAUDE_TIMEOUT_MS', () => {
      vi.useFakeTimers()

      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const complete = vi.fn()
      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      runClaudeOnRequest(req, vi.fn(), complete, broadcast)

      vi.advanceTimersByTime(3 * 60 * 1000 + 100)

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(complete).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'failed', error: expect.stringContaining('超时') }))
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'design:failed',
          id: 'req-1',
          error: expect.stringContaining('超时'),
        }),
      )
    })

    it('does not fire timeout after process completes normally', () => {
      vi.useFakeTimers()

      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), broadcast)

      proc.stdout.emit('data', Buffer.from('done\n'))
      proc.emit('close', 0)

      vi.advanceTimersByTime(3 * 60 * 1000 + 100)

      const failBroadcasts = broadcast.mock.calls.filter(
        (c) => c[0].type === 'design:failed',
      )
      expect(failBroadcasts).toHaveLength(0)
    })
  })

  // ── Cancel ───────────────────────────────────────────────────────────────

  describe('cancel function', () => {
    beforeEach(() => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no lsof') })
    })

    it('kills process and broadcasts user cancel', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const complete = vi.fn()
      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      const cancel = runClaudeOnRequest(req, vi.fn(), complete, broadcast)
      cancel()

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(complete).toHaveBeenCalledWith('req-1', expect.objectContaining({ status: 'failed', error: '用户取消' }))
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'design:failed',
          id: 'req-1',
          error: '用户取消',
        }),
      )
    })

    it('ignores close event after cancel', () => {
      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const broadcast = vi.fn()
      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/App.tsx' }),
      })

      const cancel = runClaudeOnRequest(req, vi.fn(), vi.fn(), broadcast)
      cancel()
      proc.emit('close', 0)

      const doneBroadcasts = broadcast.mock.calls.filter(
        (c) => c[0].type === 'design:done',
      )
      expect(doneBroadcasts).toHaveLength(0)
    })
  })

  // ── Direct prompt path (sourceFile is present) ───────────────────────────

  describe('direct prompt when sourceFile is present', () => {
    it('uses buildPrompt with resolved file path', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no find') })
      mockExistsSync.mockReturnValue(true)

      const proc = makeMockProcess()
      mockSpawn.mockReturnValue(proc)

      const req = makeRequest({
        element: makeElement({ sourceFile: '/src/components/Button.tsx', sourceLine: 42 }),
      })

      runClaudeOnRequest(req, vi.fn(), vi.fn(), vi.fn())

      const prompt = mockSpawn.mock.calls[0][1][1] as string
      expect(prompt).toContain('Button.tsx')
      expect(prompt).toContain('42')
      expect(prompt).toContain('立即修改源代码')
      expect(prompt).not.toContain('源文件路径未知')
    })
  })
})
