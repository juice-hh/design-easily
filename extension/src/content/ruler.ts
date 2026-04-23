/**
 * Ruler mode — shows element dimensions and distances to nearby elements on hover.
 * Displays px labels on cyan overlay lines, Figma-style.
 */

import { Z } from './tokens.js'

const RULER_ID = 'de-ruler-canvas'
const RULER_STYLES_ID = 'de-ruler-styles'
const RULER_SEARCH_DISTANCE = 300
const RULER_GAP_THRESHOLD = 200

function ensureStyles(): void {
  if (document.getElementById(RULER_STYLES_ID)) return
  const style = document.createElement('style')
  style.id = RULER_STYLES_ID
  style.textContent = `
    #de-ruler-canvas {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: ${Z.RULER};
      overflow: hidden;
    }
    .de-ruler-line {
      position: absolute;
      background: rgba(52, 199, 89, 0.65);
    }
    .de-ruler-line.anchor {
      background: rgba(139, 92, 246, 0.8);
    }
    .de-ruler-label {
      position: absolute;
      background: rgba(52, 199, 89, 0.9);
      color: white;
      font-size: 10px;
      font-family: "SF Mono", "Menlo", monospace;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
      font-weight: 500;
    }
    .de-ruler-label.anchor {
      background: rgba(139, 92, 246, 0.9);
    }
    .de-ruler-target {
      position: absolute;
      border: 1.5px dashed rgba(52, 199, 89, 0.85);
      pointer-events: none;
      box-sizing: border-box;
    }
    .de-size-label {
      position: absolute;
      background: rgba(52, 199, 89, 0.9);
      color: white;
      font-size: 10px;
      font-family: "SF Mono", "Menlo", monospace;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
    }
    .de-ruler-anchor-label {
      position: absolute;
      background: rgba(139, 92, 246, 0.9);
      color: white;
      font-size: 9px;
      font-family: "SF Mono", "Menlo", monospace;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
    }
    .de-ruler-target.anchored {
      border-color: rgba(139, 92, 246, 0.9);
    }
  `
  document.head.appendChild(style)
}

function getCanvas(): HTMLElement {
  let el = document.getElementById(RULER_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = RULER_ID
    el.dataset['designEasily'] = 'ruler'
    document.body.appendChild(el)
  }
  return el
}

function clearCanvas(): void {
  const el = document.getElementById(RULER_ID)
  if (el) el.innerHTML = ''
}

function createLine(
  canvas: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  extraClass = '',
): void {
  const line = document.createElement('div')
  line.className = extraClass ? `de-ruler-line ${extraClass}` : 'de-ruler-line'
  Object.assign(line.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  })
  canvas.appendChild(line)

  const lbl = document.createElement('div')
  lbl.className = extraClass ? `de-ruler-label ${extraClass}` : 'de-ruler-label'
  lbl.textContent = label
  Object.assign(lbl.style, {
    left: `${x + w / 2 - 15}px`,
    top: `${y + h / 2 - 8}px`,
  })
  canvas.appendChild(lbl)
}

function drawGuideH(canvas: HTMLElement, y: number, anchor = false): void {
  const color = anchor ? 'rgba(${ACCENT_RGB},0.4)' : 'rgba(52,199,89,0.4)'
  const line = document.createElement('div')
  Object.assign(line.style, {
    position: 'absolute',
    left: '0',
    top: `${y}px`,
    width: '100%',
    height: '0',
    borderTop: `1px dashed ${color}`,
    pointerEvents: 'none',
  })
  canvas.appendChild(line)
}

function drawGuideV(canvas: HTMLElement, x: number, anchor = false): void {
  const color = anchor ? 'rgba(${ACCENT_RGB},0.4)' : 'rgba(52,199,89,0.4)'
  const line = document.createElement('div')
  Object.assign(line.style, {
    position: 'absolute',
    top: '0',
    left: `${x}px`,
    height: '100%',
    width: '0',
    borderLeft: `1px dashed ${color}`,
    pointerEvents: 'none',
  })
  canvas.appendChild(line)
}

function drawTargetOverlay(canvas: HTMLElement, tr: DOMRect): void {
  const outline = document.createElement('div')
  outline.className = 'de-ruler-target'
  Object.assign(outline.style, { left: `${tr.left}px`, top: `${tr.top}px`, width: `${tr.width}px`, height: `${tr.height}px` })
  canvas.appendChild(outline)

  const sizeLabel = document.createElement('div')
  sizeLabel.className = 'de-size-label'
  sizeLabel.textContent = `${Math.round(tr.width)} × ${Math.round(tr.height)}`
  Object.assign(sizeLabel.style, { left: `${tr.left}px`, top: `${tr.top - 20}px` })
  canvas.appendChild(sizeLabel)
}

function drawAnchorOverlay(canvas: HTMLElement, tr: DOMRect, ar: DOMRect): void {
  drawGuideH(canvas, ar.top, true)
  drawGuideH(canvas, ar.bottom, true)
  drawGuideV(canvas, ar.left, true)
  drawGuideV(canvas, ar.right, true)

  const anchorOutline = document.createElement('div')
  anchorOutline.className = 'de-ruler-target anchored'
  Object.assign(anchorOutline.style, { left: `${ar.left}px`, top: `${ar.top}px`, width: `${ar.width}px`, height: `${ar.height}px` })
  canvas.appendChild(anchorOutline)

  const anchorLabel = document.createElement('div')
  anchorLabel.className = 'de-ruler-anchor-label'
  anchorLabel.textContent = '已锚定'
  Object.assign(anchorLabel.style, { left: `${ar.left}px`, top: `${ar.top - 18}px` })
  canvas.appendChild(anchorLabel)

  const hGap = Math.max(ar.left - tr.right, tr.left - ar.right)
  if (hGap > 0) {
    const fromX = ar.left > tr.right ? tr.right : ar.right
    const midY = Math.min(tr.top, ar.top) + Math.abs(tr.top - ar.top) / 2
    createLine(canvas, fromX, midY, hGap, 1, `${Math.round(hGap)}px`, 'anchor')
  }

  const vGap = Math.max(ar.top - tr.bottom, tr.top - ar.bottom)
  if (vGap > 0) {
    const fromY = ar.top > tr.bottom ? tr.bottom : ar.bottom
    const midX = Math.min(tr.left, ar.left) + Math.abs(tr.left - ar.left) / 2
    createLine(canvas, midX, fromY, 1, vGap, `${Math.round(vGap)}px`, 'anchor')
  }
}

function drawVerticalGap(canvas: HTMLElement, tr: DOMRect, sr: DOMRect): void {
  if (sr.top > tr.bottom) {
    const gap = sr.top - tr.bottom
    if (gap > 0 && gap < RULER_GAP_THRESHOLD) createLine(canvas, tr.left + tr.width / 2, tr.bottom, 1, gap, `${Math.round(gap)}px`)
  } else if (sr.bottom < tr.top) {
    const gap = tr.top - sr.bottom
    if (gap > 0 && gap < RULER_GAP_THRESHOLD) createLine(canvas, tr.left + tr.width / 2, sr.bottom, 1, gap, `${Math.round(gap)}px`)
  }
}

function drawHorizontalGap(canvas: HTMLElement, tr: DOMRect, sr: DOMRect): void {
  if (sr.left > tr.right) {
    const gap = sr.left - tr.right
    if (gap > 0 && gap < RULER_GAP_THRESHOLD) createLine(canvas, tr.right, tr.top + tr.height / 2, gap, 1, `${Math.round(gap)}px`)
  } else if (sr.right < tr.left) {
    const gap = tr.left - sr.right
    if (gap > 0 && gap < RULER_GAP_THRESHOLD) createLine(canvas, sr.right, tr.top + tr.height / 2, gap, 1, `${Math.round(gap)}px`)
  }
}

function drawSiblingGaps(canvas: HTMLElement, tr: DOMRect, target: Element): void {
  const parent = target.parentElement
  if (!parent) return
  const siblings = Array.from(parent.children).filter(
    (el) => el !== target && !(el as HTMLElement).dataset['designEasily'],
  )
  for (const sibling of siblings.slice(0, 4)) {
    const sr = sibling.getBoundingClientRect()
    const hDist = Math.min(Math.abs(tr.right - sr.left), Math.abs(sr.right - tr.left))
    const vDist = Math.min(Math.abs(tr.bottom - sr.top), Math.abs(sr.bottom - tr.top))
    if (hDist < RULER_SEARCH_DISTANCE && sr.right > tr.left && sr.left < tr.right) drawVerticalGap(canvas, tr, sr)
    if (vDist < RULER_SEARCH_DISTANCE && sr.bottom > tr.top && sr.top < tr.bottom) drawHorizontalGap(canvas, tr, sr)
  }
}

function drawPadding(canvas: HTMLElement, tr: DOMRect, target: Element): void {
  const computed = globalThis.getComputedStyle(target)
  const pt = Number.parseInt(computed.paddingTop)
  const pr = Number.parseInt(computed.paddingRight)
  const pb = Number.parseInt(computed.paddingBottom)
  const pl = Number.parseInt(computed.paddingLeft)
  if (pt > 0) createLine(canvas, tr.left + tr.width / 2, tr.top, 1, pt, `${pt}`)
  if (pb > 0) createLine(canvas, tr.left + tr.width / 2, tr.bottom - pb, 1, pb, `${pb}`)
  if (pl > 0) createLine(canvas, tr.left, tr.top + tr.height / 2, pl, 1, `${pl}`)
  if (pr > 0) createLine(canvas, tr.right - pr, tr.top + tr.height / 2, pr, 1, `${pr}`)
}

function drawRuler(target: Element, anchorEl: Element | null = null): void {
  const canvas = getCanvas()
  clearCanvas()

  const tr = target.getBoundingClientRect()

  drawGuideH(canvas, tr.top)
  drawGuideH(canvas, tr.bottom)
  drawGuideV(canvas, tr.left)
  drawGuideV(canvas, tr.right)
  drawTargetOverlay(canvas, tr)

  if (anchorEl && anchorEl !== target) {
    drawAnchorOverlay(canvas, tr, anchorEl.getBoundingClientRect())
    return
  }

  drawSiblingGaps(canvas, tr, target)
  drawPadding(canvas, tr, target)
}

// ─── Ruler mode controller ────────────────────────────────────────────────────

export class RulerMode {
  private anchorEl: Element | null = null

  constructor() {
    ensureStyles()
  }

  enable(): void {
    const canvas = getCanvas()
    canvas.style.display = 'block'
    document.addEventListener('mouseover', this.onHover, true)
    document.addEventListener('click', this.onClick, true)
    document.body.style.cursor = 'crosshair'
  }

  disable(): void {
    document.removeEventListener('mouseover', this.onHover, true)
    document.removeEventListener('click', this.onClick, true)
    document.body.style.cursor = ''
    this.anchorEl = null
    clearCanvas()
    const canvas = document.getElementById(RULER_ID)
    if (canvas) canvas.style.display = 'none'
  }

  enablePassive(): void {
    const canvas = getCanvas()
    canvas.style.display = 'block'
    document.addEventListener('mouseover', this.onHover, true)
  }

  disablePassive(): void {
    document.removeEventListener('mouseover', this.onHover, true)
    this.anchorEl = null
    clearCanvas()
    const canvas = document.getElementById(RULER_ID)
    if (canvas) canvas.style.display = 'none'
  }

  private readonly onClick = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || (target as HTMLElement).dataset['designEasily']) return
    e.preventDefault()
    e.stopPropagation()
    // Toggle anchor: click same element to deselect
    this.anchorEl = this.anchorEl === target ? null : target
    drawRuler(target, this.anchorEl)
  }

  private readonly onHover = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || (target as HTMLElement).dataset['designEasily']) return
    drawRuler(target, this.anchorEl)
  }

  destroy(): void {
    this.disable()
    document.getElementById(RULER_ID)?.remove()
    document.getElementById(RULER_STYLES_ID)?.remove()
  }
}
