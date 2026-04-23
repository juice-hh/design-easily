/**
 * Highlight overlays and ElementContext for inspect mode.
 */

import { extractFiberInfo, getComponentBreadcrumb, type FiberInfo } from './fiber'
import { Z } from './tokens.js'

// ─── Highlight overlay constants ──────────────────────────────────────────────

export const HOVER_HIGHLIGHT_ID    = 'de-highlight-hover'
export const SELECTED_HIGHLIGHT_ID = 'de-highlight-selected'

// Purple for hover, rose for selected
export const HOVER_COLOR    = '#8B5CF6'
export const HOVER_RGB      = '139, 92, 246'
export const SELECTED_COLOR = '#FEAEF9'
export const SELECTED_RGB   = '254, 174, 249'

// ─── Highlight overlay functions ──────────────────────────────────────────────

function createHighlightEl(id: string, color: string, rgb: string): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  el.dataset['designEasily'] = 'highlight'
  Object.assign(el.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: String(Z.HIGHLIGHT),
    border: `2px solid ${color}`,
    borderRadius: '4px',
    background: `rgba(${rgb}, 0.06)`,
    transition: 'all 0.08s ease',
    display: 'none',
    boxSizing: 'border-box',
  })
  document.body.appendChild(el)
  return el
}

export function getOrCreateHighlight(id: string, color: string, rgb: string): HTMLElement {
  return document.getElementById(id) ?? createHighlightEl(id, color, rgb)
}

export function positionHighlight(el: HTMLElement, target: Element, color: string, componentName?: string): void {
  const rect = target.getBoundingClientRect()
  Object.assign(el.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })

  // Component name label at top-left corner
  let label = el.querySelector<HTMLElement>('.de-component-label')
  if (!label) {
    label = document.createElement('div')
    label.className = 'de-component-label'
    Object.assign(label.style, {
      position: 'absolute',
      left: '-1px',
      color: 'white',
      fontSize: '10px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", monospace',
      fontWeight: '600',
      padding: '2px 6px',
      borderRadius: '4px 4px 4px 0',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      lineHeight: '16px',
      zIndex: '1',
    })
    el.appendChild(label)
  }
  label.style.background = color

  const tag = target.tagName.toLowerCase()
  const cls = (target as HTMLElement).classList[0]
  const labelText = cls ? `<${tag}>.${cls}` : `<${tag}>`
  label.textContent = labelText
  label.style.display = 'block'
  if (rect.top < 26) {
    label.style.top = '100%'
    label.style.bottom = ''
    label.style.borderRadius = '0 4px 4px 4px'
  } else {
    label.style.bottom = '100%'
    label.style.top = ''
    label.style.borderRadius = '4px 4px 4px 0'
  }
}

export function hideEl(id: string): void {
  const el = document.getElementById(id)
  if (el) el.style.display = 'none'
}

// ─── Element context ──────────────────────────────────────────────────────────

export interface ElementContext {
  tag: string
  id: string
  classList: string[]
  textContent: string
  fiber: FiberInfo
  breadcrumb: string[]
  computedStyles: Record<string, string>
  rect: DOMRect
}

const RELEVANT_STYLES = [
  'display', 'flexDirection', 'alignItems', 'justifyContent',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'width', 'height', 'minWidth', 'maxWidth',
  'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'color',
  'backgroundColor', 'borderRadius', 'border',
  'position', 'top', 'left', 'right', 'bottom',
  'opacity', 'boxShadow',
]

export function buildContext(target: Element): ElementContext {
  const computed = globalThis.getComputedStyle(target)
  const styles: Record<string, string> = {}
  for (const key of RELEVANT_STYLES) {
    // NOSONAR: replaceAll unavailable in ES2020 target; global /g regex is equivalent
    const val = computed.getPropertyValue(key.replace(/([A-Z])/g, '-$1').toLowerCase())
    if (val && val !== 'initial' && val !== 'normal' && (val !== 'auto' || key.startsWith('margin'))) {
      styles[key] = val
    }
  }

  return {
    tag: target.tagName.toLowerCase(),
    id: target.id,
    classList: Array.from(target.classList),
    textContent: target.textContent?.trim().slice(0, 200) ?? '',
    fiber: extractFiberInfo(target),
    breadcrumb: getComponentBreadcrumb(target),
    computedStyles: styles,
    rect: target.getBoundingClientRect(),
  }
}
