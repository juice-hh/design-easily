import { describe, it, expect, beforeEach, vi } from 'vitest'
import { requestHistory } from '../../extension/src/content/requestHistory.js'

beforeEach(() => requestHistory._resetForTest())

describe('requestHistory — add', () => {
  it('adds a new entry; getAll returns it', () => {
    requestHistory.add({ id: 'a1', action: 'suggest', userMessage: 'make it blue', status: 'pending' })
    const all = requestHistory.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('a1')
    expect(all[0].action).toBe('suggest')
    expect(all[0].userMessage).toBe('make it blue')
    expect(all[0].status).toBe('pending')
    expect(typeof all[0].createdAt).toBe('number')
  })

  it('is idempotent — duplicate id is silently ignored', () => {
    requestHistory.add({ id: 'a1', action: 'suggest', userMessage: 'first', status: 'pending' })
    requestHistory.add({ id: 'a1', action: 'develop', userMessage: 'second', status: 'pending' })
    const all = requestHistory.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].userMessage).toBe('first')
  })
})

describe('requestHistory — update', () => {
  it('updates status and optional fields on an existing entry', () => {
    requestHistory.add({ id: 'b1', action: 'develop', userMessage: 'fix nav', status: 'pending' })
    requestHistory.update('b1', { status: 'completed', changedFiles: ['src/Nav.tsx'] })
    const entry = requestHistory.getAll()[0]
    expect(entry.status).toBe('completed')
    expect(entry.changedFiles).toEqual(['src/Nav.tsx'])
    // original fields preserved
    expect(entry.userMessage).toBe('fix nav')
  })

  it('is a no-op for an unknown id — does not throw', () => {
    expect(() => requestHistory.update('nonexistent', { status: 'failed' })).not.toThrow()
  })
})

describe('requestHistory — pendingCount', () => {
  it('counts entries with status pending or processing', () => {
    requestHistory.add({ id: 'c1', action: 'suggest', userMessage: 'q1', status: 'pending' })
    requestHistory.add({ id: 'c2', action: 'develop', userMessage: 'q2', status: 'pending' })
    requestHistory.update('c2', { status: 'processing' })
    requestHistory.add({ id: 'c3', action: 'develop', userMessage: 'q3', status: 'pending' })
    requestHistory.update('c3', { status: 'completed' })
    expect(requestHistory.pendingCount()).toBe(2) // c1 pending + c2 processing
  })
})

describe('requestHistory — onChange', () => {
  it('calls listener after add', () => {
    const cb = vi.fn()
    const unsub = requestHistory.onChange(cb)
    requestHistory.add({ id: 'd1', action: 'suggest', userMessage: 'x', status: 'pending' })
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('calls listener after update on an existing id', () => {
    requestHistory.add({ id: 'd2', action: 'develop', userMessage: 'y', status: 'pending' })
    const cb = vi.fn()
    const unsub = requestHistory.onChange(cb)
    requestHistory.update('d2', { status: 'processing' })
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('does NOT call listener after update on a non-existent id', () => {
    const cb = vi.fn()
    const unsub = requestHistory.onChange(cb)
    requestHistory.update('ghost', { status: 'failed' })
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})
