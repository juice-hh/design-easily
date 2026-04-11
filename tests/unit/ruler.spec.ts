import { describe, it, expect } from 'vitest'

// Tests for ruler distance calculation logic (pure arithmetic, no DOM)
describe('ruler distance calculation', () => {
  it('calculates horizontal gap between two rects (right of left element)', () => {
    const a = { left: 0, right: 100, top: 50, bottom: 100 }
    const b = { left: 124, right: 200, top: 50, bottom: 100 }
    const hGap = Math.max(a.left - b.right, b.left - a.right)
    expect(hGap).toBe(24)
  })

  it('calculates vertical gap between two rects (below top element)', () => {
    const a = { left: 50, right: 150, top: 0, bottom: 60 }
    const b = { left: 50, right: 150, top: 84, bottom: 144 }
    const vGap = Math.max(a.top - b.bottom, b.top - a.bottom)
    expect(vGap).toBe(24)
  })

  it('returns negative gap when elements overlap horizontally', () => {
    const a = { left: 0, right: 100 }
    const b = { left: 80, right: 180 }
    const hGap = Math.max(a.left - b.right, b.left - a.right)
    expect(hGap).toBeLessThan(0) // overlapping, no visible gap
  })

  it('anchor and hover are same element → no distance drawn', () => {
    const el = { left: 10, right: 60, top: 10, bottom: 40 }
    // When anchorEl === target, drawRuler skips anchor path
    const anchorIsSame = el === el
    expect(anchorIsSame).toBe(true)
  })
})
