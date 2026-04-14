// Source: specs/02-change-tracker-test-plan.md — Edge Cases

import { describe, it, expect, beforeEach, vi } from 'vitest'

let changeTracker: typeof import('../../extension/src/content/changes.js')['changeTracker']

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('../../extension/src/content/changes.js')
  changeTracker = mod.changeTracker
  changeTracker.reset()
})

describe('02 — ChangeTracker Edge Cases', () => {
  it('importJSON with invalid JSON throws an Error', () => {
    expect(() => changeTracker.importJSON('NOT_JSON')).toThrow()
  })

  it('importJSON with missing changes field defaults to empty array', () => {
    changeTracker.importJSON(JSON.stringify({ comments: [] }))
    expect(changeTracker.getChanges()).toHaveLength(0)
  })

  it('removeChange with non-existent id has no side effect', () => {
    changeTracker.addChange({
      type: 'style',
      selector: '#a',
      componentName: null,
      sourceFile: null,
      sourceLine: null,
      property: 'color',
      oldValue: 'red',
      newValue: 'blue',
    })
    changeTracker.removeChange('ghost-id')
    expect(changeTracker.getChanges()).toHaveLength(1)
  })

  it('exportAIPrompt returns non-empty string with 0 changes', () => {
    const prompt = changeTracker.exportAIPrompt()
    expect(typeof prompt).toBe('string')
    expect(prompt.trim().length).toBeGreaterThan(0)
  })

  it('getChanges returns a copy — mutating it does not affect internal state', () => {
    changeTracker.addChange({
      type: 'style',
      selector: '#a',
      componentName: null,
      sourceFile: null,
      sourceLine: null,
      property: 'color',
      oldValue: 'red',
      newValue: 'blue',
    })
    const copy = changeTracker.getChanges()
    copy.pop()
    expect(changeTracker.getChanges()).toHaveLength(1)
  })
})
