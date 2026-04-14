// Source: specs/02-change-tracker-test-plan.md — Recommended First Batch
// Note: ChangeTracker is a pure in-memory class — no browser APIs needed.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// We import the class directly (not the singleton) by re-creating it for each test.
// Since the module exports a singleton, we need to work around shared state.
// Strategy: re-import as a fresh module via unstable_mockModule or use the class directly.

// ChangeTracker is not exported as a class, only as a singleton.
// We'll test via the singleton but reset between tests.

let changeTracker: typeof import('../../extension/src/content/changes.js')['changeTracker']

beforeEach(async () => {
  // Re-import to get a fresh module — vitest isolates modules between tests when using vi.resetModules()
  vi.resetModules()
  const mod = await import('../../extension/src/content/changes.js')
  changeTracker = mod.changeTracker
  changeTracker.reset()
})

const CHANGE_BASE = {
  type: 'style' as const,
  selector: '#foo',
  componentName: 'FooCard',
  sourceFile: '/src/FooCard.tsx',
  sourceLine: 10,
  property: 'color',
  oldValue: 'red',
  newValue: 'blue',
}

const COMMENT_BASE = {
  selector: '#bar',
  componentName: 'BarList',
  text: '改成悬浮高亮',
}

describe('02 — ChangeTracker', () => {
  describe('addChange / getChanges', () => {
    it('starts empty', () => {
      expect(changeTracker.getChanges()).toHaveLength(0)
    })

    it('addChange increases list length by 1', () => {
      changeTracker.addChange(CHANGE_BASE)
      expect(changeTracker.getChanges()).toHaveLength(1)
    })

    it('each change gets a unique id', () => {
      changeTracker.addChange(CHANGE_BASE)
      changeTracker.addChange({ ...CHANGE_BASE, property: 'fontSize' })
      const [a, b] = changeTracker.getChanges()
      expect(a!.id).not.toBe(b!.id)
    })

    it('stored change contains all provided fields', () => {
      changeTracker.addChange(CHANGE_BASE)
      const [c] = changeTracker.getChanges()
      expect(c).toMatchObject(CHANGE_BASE)
    })
  })

  describe('addComment / getComments', () => {
    it('addComment increases comments length by 1', () => {
      changeTracker.addComment(COMMENT_BASE)
      expect(changeTracker.getComments()).toHaveLength(1)
    })

    it('stored comment contains all provided fields', () => {
      changeTracker.addComment(COMMENT_BASE)
      const [c] = changeTracker.getComments()
      expect(c).toMatchObject(COMMENT_BASE)
    })
  })

  describe('removeChange', () => {
    it('removes the change with the given id', () => {
      changeTracker.addChange(CHANGE_BASE)
      const [c] = changeTracker.getChanges()
      changeTracker.removeChange(c!.id)
      expect(changeTracker.getChanges()).toHaveLength(0)
    })

    it('non-existent id has no side effect', () => {
      changeTracker.addChange(CHANGE_BASE)
      changeTracker.removeChange('does-not-exist')
      expect(changeTracker.getChanges()).toHaveLength(1)
    })
  })

  describe('removeComment', () => {
    it('removes the comment with the given id', () => {
      changeTracker.addComment(COMMENT_BASE)
      const [c] = changeTracker.getComments()
      changeTracker.removeComment(c!.id)
      expect(changeTracker.getComments()).toHaveLength(0)
    })
  })

  describe('reset', () => {
    it('clears both changes and comments', () => {
      changeTracker.addChange(CHANGE_BASE)
      changeTracker.addComment(COMMENT_BASE)
      changeTracker.reset()
      expect(changeTracker.getChanges()).toHaveLength(0)
      expect(changeTracker.getComments()).toHaveLength(0)
    })
  })

  describe('exportJSON / importJSON round-trip', () => {
    it('exportJSON returns a valid JSON string', () => {
      changeTracker.addChange(CHANGE_BASE)
      const json = changeTracker.exportJSON()
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('JSON structure contains changes and comments arrays', () => {
      changeTracker.addChange(CHANGE_BASE)
      changeTracker.addComment(COMMENT_BASE)
      const parsed = JSON.parse(changeTracker.exportJSON())
      expect(Array.isArray(parsed.changes)).toBe(true)
      expect(Array.isArray(parsed.comments)).toBe(true)
    })

    it('defaults comments to empty array when JSON has no comments key (changes.ts:139)', () => {
      changeTracker.importJSON(JSON.stringify({ changes: [] }))
      expect(changeTracker.getComments()).toHaveLength(0)
    })

    it('importJSON restores changes and comments', () => {
      changeTracker.addChange(CHANGE_BASE)
      changeTracker.addComment(COMMENT_BASE)
      const json = changeTracker.exportJSON()

      changeTracker.reset()
      changeTracker.importJSON(json)

      expect(changeTracker.getChanges()).toHaveLength(1)
      expect(changeTracker.getComments()).toHaveLength(1)
      expect(changeTracker.getChanges()[0]).toMatchObject(CHANGE_BASE)
    })
  })

  describe('exportAIPrompt', () => {
    it('contains change details when changes exist', () => {
      changeTracker.addChange(CHANGE_BASE)
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt).toContain('FooCard')
      expect(prompt).toContain('color')
      expect(prompt).toContain('red')
      expect(prompt).toContain('blue')
    })

    it('contains comment text when comments exist', () => {
      changeTracker.addComment(COMMENT_BASE)
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt).toContain('改成悬浮高亮')
    })

    it('returns non-empty string even with 0 changes', () => {
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt.length).toBeGreaterThan(0)
    })

    it('uses selector as fallback when componentName is null (changes.ts:109)', () => {
      changeTracker.addChange({ ...CHANGE_BASE, componentName: null })
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt).toContain(CHANGE_BASE.selector)
    })

    it('omits sourceFile line when sourceFile is null (changes.ts:110)', () => {
      changeTracker.addChange({ ...CHANGE_BASE, sourceFile: null, sourceLine: null })
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt).not.toContain('源文件')
    })

    it('uses selector as fallback for comment when componentName is null (changes.ts:125)', () => {
      changeTracker.addComment({ ...COMMENT_BASE, componentName: null })
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt).toContain(COMMENT_BASE.selector)
    })

    it('includes 原文/新文 lines for text-type changes (line 116-117)', () => {
      changeTracker.addChange({
        type: 'text' as const,
        selector: '#heading',
        componentName: 'Heading',
        sourceFile: '/src/Heading.tsx',
        sourceLine: 5,
        property: 'textContent',
        oldValue: '欢迎使用',
        newValue: '设计每一个细节',
      })
      const prompt = changeTracker.exportAIPrompt()
      expect(prompt).toContain('原文：欢迎使用')
      expect(prompt).toContain('新文：设计每一个细节')
    })
  })

  // Fix 4: dedup key uses sourceFile+sourceLine — same selector, different source → two entries
  describe('addChange dedup key includes sourceFile + sourceLine', () => {
    it('keeps two entries when selector is the same but sourceFile differs', () => {
      changeTracker.addChange({ ...CHANGE_BASE, sourceFile: '/src/CardA.tsx', sourceLine: 10 })
      changeTracker.addChange({ ...CHANGE_BASE, sourceFile: '/src/CardB.tsx', sourceLine: 10 })
      expect(changeTracker.getChanges()).toHaveLength(2)
    })

    it('keeps two entries when selector and sourceFile are same but sourceLine differs', () => {
      changeTracker.addChange({ ...CHANGE_BASE, sourceLine: 10 })
      changeTracker.addChange({ ...CHANGE_BASE, sourceLine: 20 })
      expect(changeTracker.getChanges()).toHaveLength(2)
    })

    it('still deduplicates when selector + sourceFile + sourceLine + property all match', () => {
      changeTracker.addChange({ ...CHANGE_BASE, newValue: 'red' })
      changeTracker.addChange({ ...CHANGE_BASE, newValue: 'blue' })
      // Same element instance, same property — should update in place
      expect(changeTracker.getChanges()).toHaveLength(1)
      expect(changeTracker.getChanges()[0]?.newValue).toBe('blue')
    })

    it('falls back to selector-only key when both elements have no sourceFile', () => {
      changeTracker.addChange({ ...CHANGE_BASE, sourceFile: null, sourceLine: null, newValue: 'red' })
      changeTracker.addChange({ ...CHANGE_BASE, sourceFile: null, sourceLine: null, newValue: 'blue' })
      // No source info — selector+property dedup still applies
      expect(changeTracker.getChanges()).toHaveLength(1)
      expect(changeTracker.getChanges()[0]?.newValue).toBe('blue')
    })
  })

  describe('onChange listener', () => {
    it('is called after addChange', () => {
      const handler = vi.fn()
      changeTracker.onChange(handler)
      changeTracker.addChange(CHANGE_BASE)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('is called after addComment', () => {
      const handler = vi.fn()
      changeTracker.onChange(handler)
      changeTracker.addComment(COMMENT_BASE)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('is called after reset', () => {
      const handler = vi.fn()
      changeTracker.onChange(handler)
      changeTracker.reset()
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe stops future notifications', () => {
      const handler = vi.fn()
      const unsub = changeTracker.onChange(handler)
      unsub()
      changeTracker.addChange(CHANGE_BASE)
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
