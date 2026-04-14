/**
 * Edit mode selection overlay — purple border + resize handles + drag handle.
 */

import { ACCENT } from '../tokens.js'

export const OVERLAY_ID = 'de-edit-overlay'

const OVERLAY_STYLES = `
  #de-edit-overlay {
    position: fixed;
    pointer-events: none;
    z-index: 2147483641;
    box-sizing: border-box;
    display: none;
  }
  #de-edit-overlay .de-outline {
    position: absolute;
    inset: -2px;
    border: 2px solid ${ACCENT};
    border-radius: 3px;
  }
  #de-edit-overlay .de-handle {
    position: absolute;
    width: 7px;
    height: 7px;
    background: ${ACCENT};
    border: 1.5px solid white;
    border-radius: 2px;
    pointer-events: all;
  }
  #de-edit-overlay .de-handle-tl { top: -5px; left: -5px; cursor: nwse-resize; }
  #de-edit-overlay .de-handle-tr { top: -5px; right: -5px; cursor: nesw-resize; }
  #de-edit-overlay .de-handle-bl { bottom: -5px; left: -5px; cursor: nesw-resize; }
  #de-edit-overlay .de-handle-br { bottom: -5px; right: -5px; cursor: nwse-resize; }
  #de-edit-overlay .de-drag-handle {
    position: absolute;
    top: -22px;
    left: 50%;
    transform: translateX(-50%);
    background: ${ACCENT};
    color: white;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 5px;
    pointer-events: all;
    cursor: grab;
    user-select: none;
    white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro", sans-serif;
    letter-spacing: 0.2px;
  }
  #de-edit-overlay .de-drag-handle:active { cursor: grabbing; }
  #de-edit-overlay .de-label {
    position: absolute;
    bottom: -20px;
    left: 0;
    font-size: 10px;
    color: ${ACCENT};
    font-family: "SF Mono", "Menlo", monospace;
    white-space: nowrap;
    pointer-events: none;
  }
  #de-edit-overlay .de-component-label {
    position: absolute;
    left: -1px;
    bottom: 100%;
    background: ${ACCENT};
    color: white;
    font-size: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro", monospace;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px 4px 4px 0;
    white-space: nowrap;
    pointer-events: none;
    line-height: 16px;
    display: none;
  }
`

let styleEl: HTMLStyleElement | null = null

export function ensureOverlayStyles(): void {
  if (styleEl) return
  styleEl = document.createElement('style')
  styleEl.textContent = OVERLAY_STYLES
  document.head.appendChild(styleEl)
}

export function getOrCreateOverlay(): HTMLElement {
  let el = document.getElementById(OVERLAY_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = OVERLAY_ID
    el.innerHTML = `
      <div class="de-outline"></div>
      <div class="de-handle de-handle-tl"></div>
      <div class="de-handle de-handle-tr"></div>
      <div class="de-handle de-handle-bl"></div>
      <div class="de-handle de-handle-br"></div>
      <div class="de-drag-handle">⠿ 拖动</div>
      <div class="de-label"></div>
      <div class="de-component-label"></div>
    `
    document.body.appendChild(el)
  }
  return el
}

export function positionOverlay(el: HTMLElement, target: Element, componentName?: string): void {
  const rect = target.getBoundingClientRect()
  const computed = window.getComputedStyle(target)
  const label = el.querySelector<HTMLElement>('.de-label')
  if (label) {
    label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} · ${computed.display}`
  }
  const compLabel = el.querySelector<HTMLElement>('.de-component-label')
  if (compLabel) {
    const tag = target.tagName.toLowerCase()
    const cls = (target as HTMLElement).classList[0]
    const labelText = cls ? `<${tag}>.${cls}` : `<${tag}>`
    if (labelText) {
      compLabel.textContent = labelText
      compLabel.style.display = 'block'
      // Flip below if near top of viewport
      if (rect.top < 26) {
        compLabel.style.bottom = ''
        compLabel.style.top = '100%'
        compLabel.style.borderRadius = '0 4px 4px 4px'
      } else {
        compLabel.style.top = ''
        compLabel.style.bottom = '100%'
        compLabel.style.borderRadius = '4px 4px 4px 0'
      }
    } else {
      compLabel.style.display = 'none'
    }
  }
  Object.assign(el.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

export function hideOverlay(): void {
  const el = document.getElementById(OVERLAY_ID)
  if (el) el.style.display = 'none'
}
