/**
 * Edit mode controller — wires together overlay, property panel, drag, and component sync.
 */

import {
  ensureOverlayStyles,
  getOrCreateOverlay,
  positionOverlay,
  hideOverlay,
} from './overlay.js'
import { PropertiesPanel, type StyleEdit } from './properties.js'
import { makeResizable } from './resize.js'
import { extractFiberInfo, getComponentBreadcrumb } from '../fiber.js'

// ─── Component sync ───────────────────────────────────────────────────────────

/**
 * Find all page elements that share the same React component name or class as target.
 */
function findSiblingInstances(target: Element): Element[] {
  const fiber = extractFiberInfo(target)

  if (fiber.componentName) {
    // Walk all elements, check if they resolve to the same component
    const allEls = Array.from(document.querySelectorAll('*'))
    return allEls.filter((el) => {
      if (el === target) return false
      const f = extractFiberInfo(el)
      return f.componentName === fiber.componentName
    })
  }

  // Fallback: same tagName + same first className
  const tag = target.tagName.toLowerCase()
  const firstClass = target.classList[0]
  if (!firstClass) return []
  return Array.from(document.querySelectorAll(`${tag}.${firstClass}`)).filter(
    (el) => el !== target,
  )
}

function applyStyleToElement(el: Element, edit: StyleEdit): void {
  if (edit.property === 'textContent') {
    el.textContent = edit.value
  } else {
    const cssProp = edit.property.replace(/([A-Z])/g, '-$1').toLowerCase()
    ;(el as HTMLElement).style.setProperty(cssProp, edit.value)
  }
}

// ─── Drag to reposition ───────────────────────────────────────────────────────

function makeDraggable(dragHandle: Element, target: Element): () => void {
  let startX = 0
  let startY = 0
  let startTop = 0
  let startLeft = 0
  let dragging = false

  const onMouseDown = (e: Event): void => {
    const me = e as MouseEvent
    me.preventDefault()
    me.stopPropagation()
    dragging = true

    const computed = window.getComputedStyle(target as HTMLElement)
    startX = me.clientX
    startY = me.clientY
    startTop = parseInt(computed.top) || 0
    startLeft = parseInt(computed.left) || 0

    // Ensure position is set
    if (computed.position === 'static') {
      ;(target as HTMLElement).style.position = 'relative'
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (e: MouseEvent): void => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    ;(target as HTMLElement).style.top = `${startTop + dy}px`
    ;(target as HTMLElement).style.left = `${startLeft + dx}px`
    // Reposition overlay
    const overlay = getOrCreateOverlay()
    positionOverlay(overlay, target)
  }

  const onMouseUp = (): void => {
    dragging = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  dragHandle.addEventListener('mousedown', onMouseDown)
  return () => {
    dragHandle.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
}

// ─── Edit mode controller ─────────────────────────────────────────────────────

export class EditMode {
  private panel: PropertiesPanel
  private selectedEl: Element | null = null
  private active = false
  private dragCleanup: (() => void) | null = null
  private resizeCleanup: (() => void) | null = null
  private overlay: HTMLElement | null = null
  private selectedEls: Set<Element> = new Set()
  private selectionOverlays: Map<Element, HTMLElement> = new Map()
  private scrollRafId: number | null = null
  constructor() {
    ensureOverlayStyles()
    this.panel = new PropertiesPanel()

    this.panel.onStyleChange((edit: StyleEdit, syncComponent: boolean) => {
      if (this.selectedEls.size > 0 && syncComponent) {
        this.selectedEls.forEach((el) => applyStyleToElement(el, edit))
        return
      }
      if (!this.selectedEl || !syncComponent) return
      const siblings = findSiblingInstances(this.selectedEl)
      siblings.forEach((el) => applyStyleToElement(el, edit))
    })
  }

  enable(): void {
    this.active = true
    this.overlay = getOrCreateOverlay()
    document.addEventListener('mouseover', this.onHover, true)
    document.addEventListener('click', this.onClick, true)
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true })
    document.body.style.cursor = 'default'
  }

  disable(): void {
    this.active = false
    document.removeEventListener('mouseover', this.onHover, true)
    document.removeEventListener('click', this.onClick, true)
    document.removeEventListener('scroll', this.onScroll, true)
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId)
      this.scrollRafId = null
    }
    document.body.style.cursor = ''
    hideOverlay()
    this.panel.hide()
    this.dragCleanup?.()
    this.dragCleanup = null
    this.resizeCleanup?.()
    this.resizeCleanup = null
    this.selectedEl = null
    this.clearSelections()
  }

  private readonly onScroll = (): void => {
    if (this.scrollRafId !== null) return
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null
      if (this.selectedEl) {
        const overlay = getOrCreateOverlay()
        positionOverlay(overlay, this.selectedEl)
      }
      this.selectionOverlays.forEach((ov, el) => {
        const rect = el.getBoundingClientRect()
        Object.assign(ov.style, {
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        })
      })
    })
  }

  private onHover = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return
    if (this.selectedEl) return // Don't move highlight when something is selected

    const overlay = getOrCreateOverlay()
    const fiber = extractFiberInfo(target)
    positionOverlay(overlay, target, fiber.componentName ?? undefined)
  }

  private onClick = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return

    e.preventDefault()
    e.stopPropagation()

    if (e.shiftKey) {
      if (this.selectedEls.has(target)) {
        this.selectedEls.delete(target)
        this.selectionOverlays.get(target)?.remove()
        this.selectionOverlays.delete(target)
      } else {
        this.selectedEls.add(target)
        this.selectionOverlays.set(target, this.createSelectionOverlay(target))
      }
      if (this.selectedEls.size > 0) {
        this.panel.setMultiSelect(this.selectedEls.size)
      }
      return
    }

    this.clearSelections()
    this.selectElement(target)
  }

  private clearSelections(): void {
    this.selectionOverlays.forEach((ov) => ov.remove())
    this.selectionOverlays.clear()
    this.selectedEls.clear()
  }

  private createSelectionOverlay(el: Element): HTMLElement {
    const ov = document.createElement('div')
    ov.setAttribute('data-design-easily', 'selection-overlay')
    Object.assign(ov.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483639',
      border: '1.5px solid rgba(0,0,0,0.5)',
      borderRadius: '3px',
      boxSizing: 'border-box',
      background: 'rgba(0,0,0,0.04)',
    })
    const rect = el.getBoundingClientRect()
    Object.assign(ov.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    document.body.appendChild(ov)
    return ov
  }

  private async selectElement(target: Element): Promise<void> {
    this.dragCleanup?.()
    this.resizeCleanup?.()

    this.selectedEl = target
    const overlay = getOrCreateOverlay()
    const fiber = extractFiberInfo(target)
    positionOverlay(overlay, target, fiber.componentName ?? undefined)

    // Wire drag handle
    const dragHandle = overlay.querySelector('.de-drag-handle')
    if (dragHandle) {
      this.dragCleanup = makeDraggable(dragHandle, target)
    }

    // Wire resize handles
    this.resizeCleanup = makeResizable(overlay, target)

    await this.panel.show(target)
  }

  destroy(): void {
    this.disable()
    this.panel.destroy()
    this.overlay?.remove()
  }
}
