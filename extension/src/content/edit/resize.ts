/**
 * Resize handles — drag any corner handle to resize the selected element.
 */

import { positionOverlay } from './overlay.js'
import { changeTracker } from '../changes.js'
import { extractFiberInfo } from '../fiber.js'
import { buildUniqueSelector } from './selector.js'
import { captureElementInfo } from './element-info.js'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

const HANDLE_SELECTORS: Record<Corner, string> = {
  tl: '.de-handle-tl',
  tr: '.de-handle-tr',
  bl: '.de-handle-bl',
  br: '.de-handle-br',
}

interface DragStart {
  readonly mouseX: number
  readonly mouseY: number
  readonly rect: DOMRect
  readonly corner: Corner
  readonly startLeft: number
  readonly startTop: number
}

function identifyCorner(handle: Element): Corner | null {
  for (const [corner, selector] of Object.entries(HANDLE_SELECTORS)) {
    if (handle.matches(selector)) return corner as Corner
  }
  return null
}

function ensurePositioned(target: HTMLElement): void {
  const computed = window.getComputedStyle(target)
  if (computed.position === 'static') {
    target.style.position = 'relative'
  }
}

function applyResize(target: HTMLElement, start: DragStart, dx: number, dy: number): void {
  const { corner, rect, startLeft, startTop } = start

  switch (corner) {
    case 'br':
      target.style.width = `${rect.width + dx}px`
      target.style.height = `${rect.height + dy}px`
      break
    case 'bl':
      target.style.width = `${rect.width - dx}px`
      target.style.height = `${rect.height + dy}px`
      target.style.left = `${startLeft + dx}px`
      break
    case 'tr':
      target.style.width = `${rect.width + dx}px`
      target.style.height = `${rect.height - dy}px`
      target.style.top = `${startTop + dy}px`
      break
    case 'tl':
      target.style.width = `${rect.width - dx}px`
      target.style.height = `${rect.height - dy}px`
      target.style.left = `${startLeft + dx}px`
      target.style.top = `${startTop + dy}px`
      break
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
    const handle = me.target as Element
    const corner = identifyCorner(handle)
    if (!corner) return

    me.preventDefault()
    me.stopPropagation()

    ensurePositioned(htmlTarget)

    const cs = globalThis.getComputedStyle(htmlTarget)
    dragStart = {
      mouseX: me.clientX,
      mouseY: me.clientY,
      rect: target.getBoundingClientRect(),
      corner,
      startLeft: Number.parseFloat(cs.left) || 0,
      startTop: Number.parseFloat(cs.top) || 0,
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (e: MouseEvent): void => {
    if (!dragStart) return

    const dx = e.clientX - dragStart.mouseX
    const dy = e.clientY - dragStart.mouseY

    applyResize(htmlTarget, dragStart, dx, dy)
    positionOverlay(overlay, target)
  }

  const onMouseUp = (): void => {
    if (!dragStart) return

    recordResizeChanges(target, dragStart.rect)
    dragStart = null

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
