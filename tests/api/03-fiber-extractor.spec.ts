// Source: specs/03-fiber-extractor-test-plan.md — Recommended First Batch
// Uses jsdom environment to simulate DOM elements with injected React fiber props.
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { extractFiberInfo, getComponentBreadcrumb } from '../../extension/src/content/fiber.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Fiber = Record<string, unknown>

function makeFiberKey(): string {
  return `__reactFiber$${Math.random().toString(36).slice(2)}`
}

function makeEl(fiber?: Fiber): Element {
  const el = document.createElement('div')
  if (fiber) {
    const key = makeFiberKey()
    ;(el as unknown as Record<string, unknown>)[key] = fiber
  }
  return el
}

function makeFunctionFiber(
  name: string,
  overrides: Partial<Fiber> = {},
): Fiber {
  function Comp() { return null }
  Object.defineProperty(Comp, 'name', { value: name })
  return {
    type: Comp,
    return: null,
    memoizedProps: {},
    pendingProps: {},
    _debugSource: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('03 — React Fiber Extractor', () => {
  describe('extractFiberInfo', () => {
    it('returns all null when element has no fiber key', () => {
      const el = makeEl() // no fiber injected
      const info = extractFiberInfo(el)
      expect(info.componentName).toBeNull()
      expect(info.sourceFile).toBeNull()
      expect(info.sourceLine).toBeNull()
      expect(info.props).toEqual({})
    })

    it('finds fiber keyed with __reactInternalInstance$ prefix (fiber.ts:22)', () => {
      const fiber = makeFunctionFiber('LegacyComp')
      const el = document.createElement('div')
      const key = `__reactInternalInstance$${Math.random().toString(36).slice(2)}`
      ;(el as unknown as Record<string, unknown>)[key] = fiber
      expect(extractFiberInfo(el).componentName).toBe('LegacyComp')
    })

    it('extracts componentName from function component', () => {
      const fiber = makeFunctionFiber('ProductCard')
      const el = makeEl(fiber)
      const info = extractFiberInfo(el)
      expect(info.componentName).toBe('ProductCard')
    })

    it('prefers displayName over function.name', () => {
      function Comp() { return null }
      Comp.displayName = 'MyDisplayName'
      const fiber: Fiber = { type: Comp, return: null, memoizedProps: {}, _debugSource: null }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBe('MyDisplayName')
    })

    it('extracts sourceFile and sourceLine from _debugSource', () => {
      const fiber = makeFunctionFiber('MyComp', {
        _debugSource: { fileName: '/src/MyComp.tsx', lineNumber: 42 },
      })
      const el = makeEl(fiber)
      const info = extractFiberInfo(el)
      expect(info.sourceFile).toBe('/src/MyComp.tsx')
      expect(info.sourceLine).toBe(42)
    })

    it('extracts name from forwardRef fiber (type.render) when _debugSource present', () => {
      function InnerComp() { return null }
      InnerComp.displayName = 'ForwardedButton'
      // forwardRef fibers have type as object — getNearestComponentFiber finds them via _debugSource
      const fiber: Fiber = {
        type: {
          $$typeof: Symbol.for('react.forward_ref'),
          render: InnerComp,
        },
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/ForwardedButton.tsx', lineNumber: 12 },
      }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBe('ForwardedButton')
    })

    it('extracts name from memo fiber (type.type) when _debugSource is present', () => {
      function MemoComp() { return null }
      MemoComp.displayName = 'MemoCard'
      // memo fibers have type as object — getNearestComponentFiber finds them via _debugSource
      const fiber: Fiber = {
        type: {
          $$typeof: Symbol.for('react.memo'),
          type: MemoComp,
        },
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/MemoCard.tsx', lineNumber: 5 },
      }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBe('MemoCard')
    })

    it('walks past DOM-type fiber to reach parent function component (fiber.ts:49-50)', () => {
      function ParentComp() { return null }
      const parentFiber: Fiber = { type: ParentComp, return: null, memoizedProps: {} }
      // DOM fiber with string type — getNearestComponentFiber must step over it
      const domFiber: Fiber = { type: 'div', return: parentFiber, _debugSource: null, memoizedProps: {} }
      const el = makeEl(domFiber)
      const info = extractFiberInfo(el)
      expect(info.componentName).toBe('ParentComp')
    })

    it('returns all null when fiber chain contains only DOM types (fiber.ts:51 + fiber.ts:109)', () => {
      // All-DOM chain — getNearestComponentFiber returns null → extractFiberInfo early-returns
      const domFiber: Fiber = { type: 'div', return: null, _debugSource: null, memoizedProps: {} }
      const el = makeEl(domFiber)
      const info = extractFiberInfo(el)
      expect(info.componentName).toBeNull()
      expect(info.sourceFile).toBeNull()
    })

    it('returns null when fiber type is null/undefined (fiber.ts:59)', () => {
      // type=null but _debugSource exists → getNearestComponentFiber returns it → getComponentName gets !type
      const fiber: Fiber = {
        type: null,
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/Null.tsx', lineNumber: 1 },
      }
      const el = makeEl(fiber)
      const info = extractFiberInfo(el)
      expect(info.componentName).toBeNull()
      expect(info.sourceFile).toBe('/src/Null.tsx')
    })

    it('returns DOM tag name when fiber type is a string (fiber.ts:60)', () => {
      // type='div' + _debugSource → getNearestComponentFiber returns it → getComponentName typeof string
      const fiber: Fiber = {
        type: 'section',
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/Dom.tsx', lineNumber: 3 },
      }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBe('section')
    })

    it('returns null when function has no displayName and null name (fiber.ts:62 ?? null branch)', () => {
      const fn = function () { return null }
      // Set name to null so type.displayName ?? type.name ?? null takes the final null
      Object.defineProperty(fn, 'name', { value: null, configurable: true })
      const fiber: Fiber = { type: fn, return: null, memoizedProps: {}, _debugSource: null }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBeNull()
    })

    it('returns null name when $$typeof wrapper has no render or type (fiber.ts:67 if-false)', () => {
      // inner is undefined → if (inner) is false → fall through to return null
      const fiber: Fiber = {
        type: { $$typeof: Symbol.for('react.forward_ref') }, // no render, no type → inner = undefined
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/Empty.tsx', lineNumber: 1 },
      }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBeNull()
    })

    it('returns function.name when inner has no displayName (fiber.ts:67 inner.name left)', () => {
      function RenderFn() { return null }
      // No displayName → falls through to inner.name
      const fiber: Fiber = {
        type: { $$typeof: Symbol.for('react.forward_ref'), render: RenderFn },
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/Render.tsx', lineNumber: 1 },
      }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBe('RenderFn')
    })

    it('returns null when inner has neither displayName nor name (fiber.ts:67 ?? null right)', () => {
      const innerFn = function () { return null }
      Object.defineProperty(innerFn, 'name', { value: null, configurable: true })
      // inner is truthy but both displayName and name are null/undefined
      const fiber: Fiber = {
        type: { $$typeof: Symbol.for('react.forward_ref'), render: innerFn },
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/NoName.tsx', lineNumber: 1 },
      }
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).componentName).toBeNull()
    })

    it('falls back to empty props when both memoizedProps and pendingProps are null (fiber.ts:87)', () => {
      const fiber = makeFunctionFiber('Comp', { memoizedProps: null, pendingProps: null })
      const el = makeEl(fiber)
      const { props } = extractFiberInfo(el)
      expect(props).toEqual({})
    })

    it('returns null componentName for object type without $$typeof (fiber.ts:69)', () => {
      // type is an object but has no $$typeof → getComponentName falls through to return null
      const fiber: Fiber = {
        type: { someRandomKey: 'value' },
        return: null,
        memoizedProps: {},
        _debugSource: { fileName: '/src/Unknown.tsx', lineNumber: 7 },
      }
      const el = makeEl(fiber)
      const info = extractFiberInfo(el)
      expect(info.componentName).toBeNull()
      expect(info.sourceFile).toBe('/src/Unknown.tsx')
    })

    it('returns null sourceFile when _debugSource.fileName is empty', () => {
      const fiber = makeFunctionFiber('MyComp', {
        _debugSource: { fileName: '', lineNumber: 10 },
      })
      const el = makeEl(fiber)
      expect(extractFiberInfo(el).sourceFile).toBeNull()
    })

    it('filters out children prop', () => {
      const fiber = makeFunctionFiber('Comp', {
        memoizedProps: { children: 'hello', title: 'foo' },
      })
      const el = makeEl(fiber)
      const { props } = extractFiberInfo(el)
      expect('children' in props).toBe(false)
      expect(props['title']).toBe('foo')
    })

    it('filters out function props', () => {
      const fiber = makeFunctionFiber('Comp', {
        memoizedProps: { onClick: () => {}, label: 'btn' },
      })
      const el = makeEl(fiber)
      const { props } = extractFiberInfo(el)
      expect('onClick' in props).toBe(false)
      expect(props['label']).toBe('btn')
    })

    it('filters out __ prefixed props', () => {
      const fiber = makeFunctionFiber('Comp', {
        memoizedProps: { __secret: 'x', visible: true },
      })
      const el = makeEl(fiber)
      const { props } = extractFiberInfo(el)
      expect('__secret' in props).toBe(false)
      expect(props['visible']).toBe(true)
    })
  })

  describe('getComponentBreadcrumb', () => {
    it('returns empty array when no fiber', () => {
      const el = makeEl()
      expect(getComponentBreadcrumb(el)).toEqual([])
    })

    it('skips non-function type fibers (fiber.ts:135 false branch)', () => {
      function Comp() { return null }
      const domFiber: Fiber = { type: 'span', return: null }
      const funcFiber: Fiber = { type: Comp, return: domFiber }
      const el = makeEl(funcFiber)
      const crumbs = getComponentBreadcrumb(el)
      expect(crumbs).toContain('Comp')
      expect(crumbs).not.toContain('span')
    })

    it('skips fibers where getComponentName returns null (fiber.ts:137 false branch)', () => {
      // Anonymous function with empty name
      const anonFn = function () { return null }
      Object.defineProperty(anonFn, 'name', { value: '' })
      const fiber: Fiber = { type: anonFn, return: null }
      const el = makeEl(fiber)
      expect(getComponentBreadcrumb(el)).toHaveLength(0)
    })

    it('deduplicates names that already appear in chain (fiber.ts:137 chain.includes branch)', () => {
      function SharedComp() { return null }
      const f1: Fiber = { type: SharedComp, return: null }
      const f2: Fiber = { type: SharedComp, return: f1 }
      const el = makeEl(f2)
      const crumbs = getComponentBreadcrumb(el)
      expect(crumbs.filter((n) => n === 'SharedComp').length).toBe(1)
    })

    it('handles fiber.return being undefined via ?? null (fiber.ts:141)', () => {
      function Comp() { return null }
      // return is undefined (not null) — exercises the ?? null branch
      const fiber: Fiber = { type: Comp, return: undefined }
      const el = makeEl(fiber)
      const crumbs = getComponentBreadcrumb(el)
      expect(crumbs).toContain('Comp')
    })

    it('returns ancestor component names up to depth 5', () => {
      // Build a 6-level chain: Root → A → B → C → D → E
      function E() { return null }
      function D() { return null }
      function C() { return null }
      function B() { return null }
      function A() { return null }
      function Root() { return null }

      const fiberE: Fiber = { type: E, return: null }
      const fiberD: Fiber = { type: D, return: fiberE }
      const fiberC: Fiber = { type: C, return: fiberD }
      const fiberB: Fiber = { type: B, return: fiberC }
      const fiberA: Fiber = { type: A, return: fiberB }
      const fiberRoot: Fiber = { type: Root, return: fiberA }

      // Link children
      fiberE.return = fiberD
      fiberD.return = fiberC
      fiberC.return = fiberB
      fiberB.return = fiberA
      fiberA.return = fiberRoot
      fiberRoot.return = null

      const el = makeEl(fiberE)
      const crumbs = getComponentBreadcrumb(el)
      // Should be at most 5
      expect(crumbs.length).toBeLessThanOrEqual(5)
      expect(crumbs[0]).toBe('E')
    })
  })
})
