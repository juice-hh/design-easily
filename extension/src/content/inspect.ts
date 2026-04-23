/**
 * Inspect mode — hover highlight + click to select + right-side info panel.
 * Frosted glass Apple-style UI.
 *
 * This file keeps only the InspectMode hover/click controller.
 * Extracted modules:
 *   inspect-vscode.ts   — openInVSCode
 *   inspect-highlight.ts — highlight overlays + ElementContext + buildContext
 *   inspect-panel.ts    — PANEL_STYLES + InspectPanel state machine
 */

export type { ElementContext } from './inspect-highlight.js'
export { InspectPanel } from './inspect-panel.js'

import {
  HOVER_HIGHLIGHT_ID,
  SELECTED_HIGHLIGHT_ID,
  HOVER_COLOR,
  HOVER_RGB,
  SELECTED_COLOR,
  getOrCreateHighlight,
  positionHighlight,
  hideEl,
  buildContext,
} from './inspect-highlight.js'
import { InspectPanel } from './inspect-panel.js'

// ─── Inspect mode controller ──────────────────────────────────────────────────

export class InspectMode {
  private panel: InspectPanel
  private readonly hoverHighlight: HTMLElement
  private readonly selectedHighlight: HTMLElement
  private selectedEl: Element | null = null
  private active = false
  private scrollRafId: number | null = null

  constructor() {
    this.panel = new InspectPanel()
    this.hoverHighlight    = getOrCreateHighlight(HOVER_HIGHLIGHT_ID,    HOVER_COLOR,    HOVER_RGB)
    this.selectedHighlight = getOrCreateHighlight(SELECTED_HIGHLIGHT_ID, SELECTED_COLOR, '254, 174, 249')
    this.panel.onTaskEnd(() => {
      this.selectedEl = null
      hideEl(SELECTED_HIGHLIGHT_ID)
    })
  }

  enable(): void {
    this.active = true
    document.addEventListener('mouseover', this.onHover, true)
    document.addEventListener('click', this.onClick, true)
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true })
    document.body.style.cursor = 'crosshair'
    if (this.panel.hasTask()) {
      this.panel.showHost()
    }
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
    hideEl(HOVER_HIGHLIGHT_ID)
    // Keep panel + selected highlight if a task is still running/done
    if (!this.panel.hasTask()) {
      this.panel.hide()
      this.selectedEl = null
      hideEl(SELECTED_HIGHLIGHT_ID)
    }
  }

  private onScroll = (): void => {
    if (this.scrollRafId !== null) return
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null
      if (this.selectedEl) {
        positionHighlight(this.selectedHighlight, this.selectedEl, SELECTED_COLOR)
      }
    })
  }

  private onHover = (e: MouseEvent): void => {
    if (this.panel.isLocked()) return
    const target = e.target as HTMLElement
    if (!target || target.dataset['designEasily']) return
    positionHighlight(this.hoverHighlight, target, HOVER_COLOR)
  }

  private onClick = (e: MouseEvent): void => {
    if (this.panel.isLocked()) return
    const target = e.target as HTMLElement
    if (!target || target.dataset['designEasily']) return

    e.preventDefault()
    e.stopPropagation()

    this.selectedEl = target
    hideEl(HOVER_HIGHLIGHT_ID)
    positionHighlight(this.selectedHighlight, target, SELECTED_COLOR)

    const ctx = buildContext(target)
    this.panel.show(ctx, target)
  }

  destroy(): void {
    this.disable()
    this.panel.destroy()
    this.hoverHighlight.remove()
    this.selectedHighlight.remove()
  }
}
