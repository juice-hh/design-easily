/**
 * Snap-to-align — Figma-style alignment guides for drag/resize in edit mode.
 *
 * - Collects sibling rects as snap candidates (edges + centers).
 * - Adjusts dx/dy so the moving edge lands on a candidate when within threshold.
 * - Renders purple dashed guide lines for each hit.
 */

import { ACCENT, Z } from '../tokens.js'

export type SnapAxis = 'x' | 'y'
export type SnapEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

export interface SnapTarget {
  readonly axis: SnapAxis
  readonly value: number
  readonly edge: SnapEdge
  readonly source: DOMRect
}

export interface SnapHit {
  readonly axis: SnapAxis
  readonly guideValue: number
  readonly movingEdge: SnapEdge
  readonly target: SnapTarget
}

const DEFAULT_THRESHOLD = 6
const GUIDE_ID = 'de-snap-guides'

const X_EDGES: ReadonlySet<SnapEdge> = new Set(['left', 'right', 'centerX'])

function isExcluded(el: Element): boolean {
  let cur: Element | null = el
  while (cur) {
    if (cur.id === 'de-edit-overlay') return true
    if ((cur as HTMLElement).dataset?.designEasily !== undefined) return true
    cur = cur.parentElement
  }
  return false
}

function pushRectTargets(out: SnapTarget[], r: DOMRect): void {
  if (r.width === 0 && r.height === 0) return
  out.push(
    { axis: 'x', value: r.left, edge: 'left', source: r },
    { axis: 'x', value: r.right, edge: 'right', source: r },
    { axis: 'x', value: r.left + r.width / 2, edge: 'centerX', source: r },
    { axis: 'y', value: r.top, edge: 'top', source: r },
    { axis: 'y', value: r.bottom, edge: 'bottom', source: r },
    { axis: 'y', value: r.top + r.height / 2, edge: 'centerY', source: r },
  )
}

function viewportRect(): DOMRect {
  return new DOMRect(0, 0, globalThis.innerWidth, globalThis.innerHeight)
}

function isVisibleBlock(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  if (r.bottom < 0 || r.top > globalThis.innerHeight) return false
  if (r.right < 0 || r.left > globalThis.innerWidth) return false
  const cs = globalThis.getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
}

export function collectSnapTargets(target: Element): readonly SnapTarget[] {
  const out: SnapTarget[] = []

  // 1. Viewport (page) edges + center
  pushRectTargets(out, viewportRect())

  // 2. Ancestor chain edges + centers
  let p = target.parentElement
  while (p && p !== document.documentElement) {
    if (!isExcluded(p)) pushRectTargets(out, p.getBoundingClientRect())
    p = p.parentElement
  }

  // 3. All visible elements page-wide (excluding target + its subtree + overlay)
  const all = document.body?.querySelectorAll<HTMLElement>('*')
  if (all) {
    for (const el of Array.from(all)) {
      if (el === target) continue
      if (target.contains(el)) continue
      if (el.contains(target)) continue // already added via ancestor chain
      if (isExcluded(el)) continue
      if (!isVisibleBlock(el)) continue
      pushRectTargets(out, el.getBoundingClientRect())
    }
  }
  return out
}

function movingEdgeValue(rect: DOMRect, edge: SnapEdge, dx: number, dy: number): number {
  switch (edge) {
    case 'left':    return rect.left + dx
    case 'right':   return rect.right + dx
    case 'centerX': return rect.left + rect.width / 2 + dx
    case 'top':     return rect.top + dy
    case 'bottom':  return rect.bottom + dy
    case 'centerY': return rect.top + rect.height / 2 + dy
  }
}

export function snapDelta(
  startRect: DOMRect,
  dx: number,
  dy: number,
  movingEdges: readonly SnapEdge[],
  candidates: readonly SnapTarget[],
  threshold: number = DEFAULT_THRESHOLD,
): { dx: number; dy: number; hits: readonly SnapHit[] } {
  let bestX: { adjust: number; hit: SnapHit } | null = null
  let bestY: { adjust: number; hit: SnapHit } | null = null

  for (const edge of movingEdges) {
    const isX = X_EDGES.has(edge)
    const cur = movingEdgeValue(startRect, edge, dx, dy)
    for (const cand of candidates) {
      if (cand.axis !== (isX ? 'x' : 'y')) continue
      const diff = cand.value - cur
      const abs = Math.abs(diff)
      if (abs > threshold) continue

      const hit: SnapHit = {
        axis: cand.axis,
        guideValue: cand.value,
        movingEdge: edge,
        target: cand,
      }
      if (isX) {
        if (!bestX || abs < Math.abs(bestX.adjust)) bestX = { adjust: diff, hit }
      } else {
        if (!bestY || abs < Math.abs(bestY.adjust)) bestY = { adjust: diff, hit }
      }
    }
  }

  const hits: SnapHit[] = []
  if (bestX) hits.push(bestX.hit)
  if (bestY) hits.push(bestY.hit)

  return {
    dx: dx + (bestX?.adjust ?? 0),
    dy: dy + (bestY?.adjust ?? 0),
    hits,
  }
}

// ─── Guide rendering ─────────────────────────────────────────────────────────

function getOrCreateContainer(): HTMLElement {
  let el = document.getElementById(GUIDE_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = GUIDE_ID
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: String(Z.RULER),
  } satisfies Partial<CSSStyleDeclaration>)
  el.setAttribute('data-design-easily', 'snap-guides')
  document.body.appendChild(el)
  return el
}

function makeLine(hit: SnapHit): HTMLElement {
  const line = document.createElement('div')
  const isX = hit.axis === 'x'
  Object.assign(line.style, {
    position: 'absolute',
    background: 'transparent',
    borderLeft:   isX ? `1px dashed ${ACCENT}` : '',
    borderTop:    isX ? '' : `1px dashed ${ACCENT}`,
    width:  isX ? '0' : '100vw',
    height: isX ? '100vh' : '0',
    left:   isX ? `${hit.guideValue}px` : '0',
    top:    isX ? '0' : `${hit.guideValue}px`,
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>)
  return line
}

export function renderSnapGuides(hits: readonly SnapHit[]): void {
  const container = getOrCreateContainer()
  container.replaceChildren(...hits.map(makeLine))
}

export function clearSnapGuides(): void {
  const el = document.getElementById(GUIDE_ID)
  el?.remove()
}
