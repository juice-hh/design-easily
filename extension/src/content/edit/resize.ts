/**
 * Resize handles — drag edges to stretch single-axis;
 * drag corners to scale proportionally (preserve aspect ratio).
 */

import { positionOverlay } from './overlay.js'
import { changeTracker } from '../changes.js'
import { extractFiberInfo } from '../fiber.js'
import { buildUniqueSelector } from './selector.js'
import { captureElementInfo } from './element-info.js'
import {
  collectSnapTargets,
  snapDelta,
  renderSnapGuides,
  clearSnapGuides,
  type SnapEdge,
  type SnapHit,
  type SnapTarget,
} from './snap.js'

type Handle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r'

const HANDLE_SELECTORS: Record<Handle, string> = {
  tl: '.de-handle-tl',
  tr: '.de-handle-tr',
  bl: '.de-handle-bl',
  br: '.de-handle-br',
  t: '.de-handle-t',
  b: '.de-handle-b',
  l: '.de-handle-l',
  r: '.de-handle-r',
}

const CORNERS: ReadonlySet<Handle> = new Set(['tl', 'tr', 'bl', 'br'])

interface DragStart {
  readonly mouseX: number
  readonly mouseY: number
  readonly rect: DOMRect
  readonly handle: Handle
  readonly startLeft: number
  readonly startTop: number
  readonly aspect: number
  readonly snapCandidates: readonly SnapTarget[]
  readonly snapEdges: readonly SnapEdge[]
}

const HANDLE_SNAP_EDGES: Record<Handle, readonly SnapEdge[]> = {
  l:  ['left'],
  r:  ['right'],
  t:  ['top'],
  b:  ['bottom'],
  tl: ['top', 'left'],
  tr: ['top', 'right'],
  bl: ['bottom', 'left'],
  br: ['bottom', 'right'],
}

function identifyHandle(el: Element): Handle | null {
  for (const [name, selector] of Object.entries(HANDLE_SELECTORS)) {
    if (el.matches(selector)) return name as Handle
  }
  return null
}

function ensurePositioned(target: HTMLElement): void {
  const computed = globalThis.getComputedStyle(target)
  if (computed.position === 'static') {
    target.style.position = 'relative'
  }
}

interface SizeDelta {
  readonly dw: number
  readonly dh: number
  readonly dLeft: number
  readonly dTop: number
}

function edgeDelta(handle: Handle, dx: number, dy: number): SizeDelta {
  switch (handle) {
    case 'r': return { dw: dx, dh: 0, dLeft: 0, dTop: 0 }
    case 'l': return { dw: -dx, dh: 0, dLeft: dx, dTop: 0 }
    case 'b': return { dw: 0, dh: dy, dLeft: 0, dTop: 0 }
    case 't': return { dw: 0, dh: -dy, dLeft: 0, dTop: dy }
    default: return { dw: 0, dh: 0, dLeft: 0, dTop: 0 }
  }
}

function cornerDelta(handle: Handle, dx: number, dy: number, aspect: number): SizeDelta {
  // Pick the dominant axis, derive the other from aspect ratio so we scale uniformly.
  const xSign = handle === 'tr' || handle === 'br' ? 1 : -1
  const ySign = handle === 'bl' || handle === 'br' ? 1 : -1
  const sx = xSign * dx
  const sy = ySign * dy

  let dw: number
  let dh: number
  if (Math.abs(sx) > Math.abs(sy * aspect)) {
    dw = sx
    dh = sx / aspect
  } else {
    dh = sy
    dw = sy * aspect
  }

  return {
    dw,
    dh,
    dLeft: xSign === -1 ? -dw : 0,
    dTop: ySign === -1 ? -dh : 0,
  }
}

function computeSizeDelta(start: DragStart, dx: number, dy: number): SizeDelta {
  return CORNERS.has(start.handle)
    ? cornerDelta(start.handle, dx, dy, start.aspect)
    : edgeDelta(start.handle, dx, dy)
}

function applySizeDelta(target: HTMLElement, start: DragStart, sd: SizeDelta): void {
  const { rect, startLeft, startTop } = start
  const nextW = Math.max(1, rect.width + sd.dw)
  const nextH = Math.max(1, rect.height + sd.dh)

  if (sd.dw !== 0) target.style.width = `${nextW}px`
  if (sd.dh !== 0) target.style.height = `${nextH}px`
  if (sd.dLeft !== 0) target.style.left = `${startLeft + sd.dLeft}px`
  if (sd.dTop !== 0) target.style.top = `${startTop + sd.dTop}px`
}

function snapCornerDelta(
  rect: DOMRect,
  sd: SizeDelta,
  handle: Handle,
  aspect: number,
  edges: readonly SnapEdge[],
  candidates: readonly SnapTarget[],
): { sd: SizeDelta; hits: readonly SnapHit[] } {
  const xSign: 1 | -1 = handle === 'tr' || handle === 'br' ? 1 : -1
  const ySign: 1 | -1 = handle === 'bl' || handle === 'br' ? 1 : -1

  const effDx = xSign * sd.dw
  const effDy = ySign * sd.dh
  const snap = snapDelta(rect, effDx, effDy, edges, candidates)
  const adjX = snap.dx - effDx
  const adjY = snap.dy - effDy

  // Pick the smaller adjustment as dominant; recompute the other axis from aspect.
  const useX = adjX !== 0 && (adjY === 0 || Math.abs(adjX) <= Math.abs(adjY))
  const useY = !useX && adjY !== 0

  let dw = sd.dw
  let dh = sd.dh
  const hits: SnapHit[] = []
  if (useX) {
    dw = xSign * snap.dx
    dh = aspect === 0 ? sd.dh : dw / aspect
    const xHit = snap.hits.find((h) => h.axis === 'x')
    if (xHit) hits.push(xHit)
  } else if (useY) {
    dh = ySign * snap.dy
    dw = dh * aspect
    const yHit = snap.hits.find((h) => h.axis === 'y')
    if (yHit) hits.push(yHit)
  }

  return {
    sd: {
      dw,
      dh,
      dLeft: xSign === -1 ? -dw : 0,
      dTop: ySign === -1 ? -dh : 0,
    },
    hits,
  }
}

function recordResizeChanges(target: Element, startRect: DOMRect): void {
  const endRect = target.getBoundingClientRect()
  const fiber = extractFiberInfo(target)
  const selector = buildUniqueSelector(target)
  const { classList, parentClassList, parentLayoutCtx } = captureElementInfo(target)

  const base = {
    type: 'style' as const,
    selector,
    componentName: fiber.componentName,
    sourceFile: fiber.sourceFile,
    sourceLine: fiber.sourceLine,
    classList,
    parentClassList,
    parentLayoutCtx,
  }

  if (Math.round(startRect.width) !== Math.round(endRect.width)) {
    changeTracker.addChange({
      ...base,
      property: 'width',
      oldValue: `${Math.round(startRect.width)}px`,
      newValue: `${Math.round(endRect.width)}px`,
    })
  }

  if (Math.round(startRect.height) !== Math.round(endRect.height)) {
    changeTracker.addChange({
      ...base,
      property: 'height',
      oldValue: `${Math.round(startRect.height)}px`,
      newValue: `${Math.round(endRect.height)}px`,
    })
  }
}

export function makeResizable(overlay: HTMLElement, target: Element): () => void {
  const htmlTarget = target as HTMLElement
  let dragStart: DragStart | null = null

  const onMouseDown = (e: Event): void => {
    const me = e as MouseEvent
    const handle = identifyHandle(me.target as Element)
    if (!handle) return

    me.preventDefault()
    me.stopPropagation()

    ensurePositioned(htmlTarget)

    const cs = globalThis.getComputedStyle(htmlTarget)
    const rect = target.getBoundingClientRect()
    dragStart = {
      mouseX: me.clientX,
      mouseY: me.clientY,
      rect,
      handle,
      startLeft: Number.parseFloat(cs.left) || 0,
      startTop: Number.parseFloat(cs.top) || 0,
      aspect: rect.height === 0 ? 1 : rect.width / rect.height,
      snapCandidates: collectSnapTargets(target),
      snapEdges: HANDLE_SNAP_EDGES[handle],
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (e: MouseEvent): void => {
    if (!dragStart) return

    const dx = e.clientX - dragStart.mouseX
    const dy = e.clientY - dragStart.mouseY
    const disabled = e.metaKey || e.ctrlKey

    let sd = computeSizeDelta(dragStart, dx, dy)
    let hits: readonly SnapHit[] = []

    if (!disabled) {
      if (CORNERS.has(dragStart.handle)) {
        const r = snapCornerDelta(
          dragStart.rect,
          sd,
          dragStart.handle,
          dragStart.aspect,
          dragStart.snapEdges,
          dragStart.snapCandidates,
        )
        sd = r.sd
        hits = r.hits
      } else {
        const snap = snapDelta(
          dragStart.rect, dx, dy, dragStart.snapEdges, dragStart.snapCandidates,
        )
        sd = computeSizeDelta(dragStart, snap.dx, snap.dy)
        hits = snap.hits
      }
    }

    applySizeDelta(htmlTarget, dragStart, sd)
    renderSnapGuides(hits)
    positionOverlay(overlay, target)
  }

  const onMouseUp = (): void => {
    if (!dragStart) return

    recordResizeChanges(target, dragStart.rect)
    dragStart = null
    clearSnapGuides()

    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  const handles = Object.values(HANDLE_SELECTORS)
    .map((sel) => overlay.querySelector(sel))
    .filter((el): el is Element => el !== null)

  handles.forEach((h) => h.addEventListener('mousedown', onMouseDown))

  return () => {
    handles.forEach((h) => h.removeEventListener('mousedown', onMouseDown))
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
}
