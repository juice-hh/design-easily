/**
 * Inspect mode — hover highlight + click to select + right-side info panel.
 * Frosted glass Apple-style UI.
 */

import { extractFiberInfo, getDegradedInfo, getComponentBreadcrumb, type FiberInfo } from './fiber'
import { wsClient } from './ws'
import { requestHistory } from './requestHistory.js'
import { ACCENT, ACCENT_HOVER, ACCENT_RGB } from './tokens.js'
import { makePanelDraggable } from './draggable.js'

// ─── VS Code integration ──────────────────────────────────────────────────────

function openInVSCode(file: string, line: number): void {
  const a = document.createElement('a')
  a.href = `vscode://file${file}:${line}`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ─── Highlight overlays ───────────────────────────────────────────────────────

const HOVER_HIGHLIGHT_ID    = 'de-highlight-hover'
const SELECTED_HIGHLIGHT_ID = 'de-highlight-selected'

// Purple for hover, rose for selected
const HOVER_COLOR    = ACCENT          // #8B5CF6
const HOVER_RGB      = ACCENT_RGB      // 139, 92, 246
const SELECTED_COLOR = '#FEAEF9'
const SELECTED_RGB   = '254, 174, 249'

function createHighlightEl(id: string, color: string, rgb: string): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  el.dataset['designEasily'] = 'highlight'
  Object.assign(el.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483640',
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

function getOrCreateHighlight(id: string, color: string, rgb: string): HTMLElement {
  return document.getElementById(id) ?? createHighlightEl(id, color, rgb)
}

function positionHighlight(el: HTMLElement, target: Element, color: string, componentName?: string): void {
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

function hideEl(id: string): void {
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

function buildContext(target: Element): ElementContext {
  const computed = window.getComputedStyle(target)
  const styles: Record<string, string> = {}
  for (const key of RELEVANT_STYLES) {
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

// ─── Info panel ───────────────────────────────────────────────────────────────

const PANEL_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 56px;
    right: 12px;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
    width: 260px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .panel {
    background: rgba(28, 28, 30, 0.88);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
    overflow: hidden;
    color: rgba(255,255,255,0.9);
    font-size: 11px;
  }
  .ip-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .ip-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.1); border-radius: 5px;
    padding: 3px 7px; font-size: 10px; font-weight: 600;
    color: rgba(255,255,255,0.7); margin-bottom: 7px;
  }
  .ip-name {
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); margin-bottom: 3px;
  }
  .ip-path {
    font-size: 10px; color: rgba(255,255,255,0.35);
    font-family: "SF Mono","Menlo",monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: pointer;
  }
  .ip-path:hover { color: #4DA3FF; }
  .ip-section {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ip-sec-title {
    font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.3);
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px;
  }
  .ip-props { display: flex; flex-wrap: wrap; gap: 4px; }
  .ip-prop {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.08); border-radius: 5px;
    padding: 3px 7px; font-size: 10px;
  }
  .ip-prop-k { color: rgba(255,255,255,0.35); }
  .ip-prop-v { color: rgba(255,255,255,0.85); font-variant-numeric: tabular-nums; font-weight: 500; }
  .ip-prop-swatch {
    width: 10px; height: 10px; border-radius: 2px;
    border: 0.5px solid rgba(255,255,255,0.15); flex-shrink: 0;
  }
  .ip-action-row {
    padding: 8px 12px; display: flex; gap: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ip-btn {
    flex: 1; height: 28px; border-radius: 6px;
    border: 1.5px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    font-family: inherit; font-size: 11px; font-weight: 500;
    color: rgba(255,255,255,0.75); cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    transition: background 0.12s;
  }
  .ip-btn:hover { background: rgba(255,255,255,0.1); }
  .ip-btn.dark {
    background: ${ACCENT}; border-color: transparent; color: white;
  }
  .ip-btn.dark:hover { background: ${ACCENT_HOVER}; }
  .ip-chat { padding: 8px 12px 12px; }
  .ip-chat-title {
    font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.3);
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px;
  }
  .ip-chat-msgs {
    max-height: 140px; overflow-y: auto; margin-bottom: 8px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .msg { padding: 7px 9px; border-radius: 8px; font-size: 11px; line-height: 1.4; max-width: 92%; }
  .msg.user { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); align-self: flex-end; border-bottom-right-radius: 3px; }
  .msg.assistant { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75); align-self: flex-start; border-bottom-left-radius: 3px; font-family: "SF Mono","Menlo",monospace; white-space: pre-wrap; word-break: break-word; }
  .msg.loading { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.3); align-self: flex-start; font-style: italic; }
  .ip-chat-input { display: flex; flex-direction: column; gap: 6px; }
  .ip-chat-btns { display: flex; gap: 6px; justify-content: flex-end; }
  .ip-btn-sm {
    padding: 5px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
    font-family: inherit; transition: opacity 0.12s;
  }
  .ip-btn-sm:hover { opacity: 0.82; }
  .ip-btn-sm.ghost {
    background: transparent; border: 1.5px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.45);
  }
  .ip-btn-sm.secondary {
    background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); border: none;
  }
  .ip-btn-sm.green { background: ${ACCENT}; color: white; border: none; }
  .ip-btn-sm.green:hover { opacity: 1; background: ${ACCENT_HOVER}; }
  .ip-btn-sm.primary { background: ${ACCENT}; color: white; border: none; }
  .ip-btn-sm:disabled { opacity: 0.35; cursor: not-allowed; }
  .ip-textarea {
    width: 100%; border-radius: 6px; border: 1.5px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.07); font-size: 11px; font-family: inherit;
    padding: 6px 8px; resize: none; color: rgba(255,255,255,0.9); height: 44px; outline: none;
    transition: border-color 0.15s; box-sizing: border-box;
  }
  .ip-textarea::placeholder { color: rgba(255,255,255,0.25); }
  .ip-textarea:focus { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.1); }
  .ip-send {
    width: 28px; height: 28px; border-radius: 6px;
    background: ${ACCENT}; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background 0.12s;
  }
  .ip-send:hover { background: ${ACCENT_HOVER}; }
  .ip-send:disabled { opacity: 0.3; cursor: not-allowed; }
  .source-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    cursor: pointer;
    border-top: 1px solid rgba(255,255,255,0.07);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .source-row:hover {
    background: rgba(255,255,255,0.05);
  }
  .source-icon {
    font-size: 13px;
  }
  .source-info {
    flex: 1;
    overflow: hidden;
  }

  /* ── Task state styles ── */
  .ip-task-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between;
  }
  .ip-task-title {
    font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7);
    letter-spacing: 0.02em;
  }
  .ip-task-cancel {
    padding: 3px 9px; border-radius: 5px; font-size: 10px; cursor: pointer;
    font-family: inherit; background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.45);
    transition: all 0.12s;
  }
  .ip-task-cancel:hover { background: rgba(255,80,80,0.15); border-color: rgba(255,80,80,0.3); color: #FF6B6B; }
  .ip-task-snapshot {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ip-task-elem {
    font-size: 10px; font-family: "SF Mono","Menlo",monospace;
    color: rgba(255,255,255,0.35); margin-bottom: 5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ip-task-msg {
    font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.45;
    word-break: break-word;
  }
  .ip-task-status {
    padding: 16px 12px;
    display: flex; align-items: center; gap: 10px;
    color: rgba(255,255,255,0.5); font-size: 12px;
  }
  .ip-spinner {
    width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
    border: 2px solid rgba(255,255,255,0.12);
    border-top-color: rgba(255,255,255,0.55);
    animation: de-spin 0.8s linear infinite;
  }
  @keyframes de-spin { to { transform: rotate(360deg); } }

  .ip-result-body { padding: 12px; }
  .ip-result-icon { font-size: 18px; margin-bottom: 6px; }
  .ip-result-summary {
    font-size: 12px; color: rgba(255,255,255,0.75); line-height: 1.45;
    margin-bottom: 10px; word-break: break-word;
  }
  .ip-result-files { display: flex; flex-direction: column; gap: 3px; margin-bottom: 12px; }
  .ip-result-file {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; border-radius: 5px; cursor: pointer;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
    transition: background 0.1s; text-decoration: none;
    font-size: 10px; font-family: "SF Mono","Menlo",monospace;
    color: rgba(255,255,255,0.6);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ip-result-file:hover { background: rgba(255,255,255,0.1); color: #4DA3FF; }
  .ip-result-actions { display: flex; gap: 6px; justify-content: flex-end; }

  .ip-error-body { padding: 12px; }
  .ip-error-icon { font-size: 18px; margin-bottom: 6px; }
  .ip-error-msg {
    font-size: 12px; color: rgba(255,100,100,0.85); line-height: 1.45;
    margin-bottom: 12px; word-break: break-word;
  }
  .ip-error-actions { display: flex; gap: 6px; justify-content: flex-end; }
`

// ─── Panel state machine ──────────────────────────────────────────────────────

type PanelState = 'inspect' | 'running' | 'success' | 'no-changes' | 'error'

interface TaskSnapshot {
  elementLabel: string
  sourceFile: string | null
  sourceLine: number | null
  userMessage: string
  element: Record<string, unknown>
}

export class InspectPanel {
  private host: HTMLElement
  private shadow: ShadowRoot

  // inspect state
  private ctx: ElementContext | null = null
  private anchorEl: Element | null = null
  private resolvedSource: { file: string; line: number } | null = null
  private sourceLookupPending = false
  private lookupEpoch = 0
  // state machine
  private state: PanelState = 'inspect'
  private runningStatus: 'analyzing' | 'editing' = 'analyzing'
  private taskId: string | null = null
  private taskSnapshot: TaskSnapshot | null = null
  private taskResult: { summary: string; changedFiles: string[] } | null = null
  private taskError: string | null = null

  private wsUnsubscribe: (() => void) | null = null
  private dragCleanup: (() => void) | null = null
  private readonly onTaskEndCallbacks: Array<() => void> = []

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'panel')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `<style>${PANEL_STYLES}</style>`
    this.host.style.display = 'none'
    document.body.appendChild(this.host)

    this.wsUnsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === 'design:queued') {
        this.taskId = msg.id
        this.state = 'running'
        requestHistory.add({
          id: msg.id,
          action: 'develop',
          userMessage: this.taskSnapshot?.userMessage ?? '',
          status: 'analyzing',
        })
        this.renderPanel()
      }
      if (msg.type === 'design:processing' && msg.id === this.taskId) {
        if (msg.status === 'editing' && this.runningStatus !== 'editing') {
          this.runningStatus = 'editing'
          this.renderPanel()
        }
      }
      if (msg.type === 'design:done' && msg.id === this.taskId) {
        this.state = msg.noChanges ? 'no-changes' : 'success'
        this.runningStatus = 'analyzing'
        this.taskResult = {
          summary: msg.summary ?? '修改完成',
          changedFiles: msg.changedFiles ?? [],
        }
        requestHistory.update(msg.id, { status: 'completed', summary: msg.summary, changedFiles: msg.changedFiles })
        this.taskId = null
        this.renderPanel()
      }
      if (msg.type === 'design:failed' && msg.id === this.taskId) {
        this.state = 'error'
        this.runningStatus = 'analyzing'
        this.taskError = msg.error
        requestHistory.update(msg.id, { status: 'failed', error: msg.error })
        this.taskId = null
        this.renderPanel()
      }
    })
  }

  isLocked(): boolean {
    return this.state === 'running'
  }

  /** True when a task is in-progress, completed, or errored (panel should persist across mode switches) */
  hasTask(): boolean {
    return this.state === 'running' || this.state === 'success' || this.state === 'no-changes' || this.state === 'error'
  }

  /** Show the host element without resetting state (used when re-entering inspect mode) */
  showHost(): void {
    this.host.style.display = ''
  }

  /** Register a callback fired when the user dismisses a task (继续审查 / 返回) */
  onTaskEnd(cb: () => void): void {
    this.onTaskEndCallbacks.push(cb)
  }

  private notifyTaskEnd(): void {
    this.onTaskEndCallbacks.forEach((cb) => cb())
  }

  show(ctx: ElementContext, anchorEl: Element): void {
    this.ctx = ctx
    this.anchorEl = anchorEl
    this.resolvedSource = null
    this.sourceLookupPending = false
    this.state = 'inspect'
    this.taskSnapshot = null
    this.taskResult = null
    this.taskError = null
    this.host.style.display = ''
    if (!ctx.fiber.sourceFile && anchorEl) {
      this.lookupEpoch++
      this.sourceLookupPending = true
      this.startSourceLookup(anchorEl, this.lookupEpoch)
    }
    this.renderPanel()
  }

  private startSourceLookup(el: Element, epoch: number): void {
    import('./source-locator.js')
      .then(({ resolveComponentSource }) => resolveComponentSource(el))
      .then((loc) => {
        if (epoch !== this.lookupEpoch) return  // stale lookup — element changed while we were waiting
        this.sourceLookupPending = false
        if (!this.ctx) return
        if (loc) this.resolvedSource = { file: loc.file, line: loc.line }
        if (this.state === 'inspect') this.renderPanel()
      })
      .catch((err) => {
        if (epoch !== this.lookupEpoch) return
        this.sourceLookupPending = false
        console.warn('[DE inspect] source lookup failed:', err)
      })
  }

  hide(): void {
    this.host.style.display = 'none'
    this.ctx = null
    this.anchorEl = null
  }

  private renderPanel(): void {
    switch (this.state) {
      case 'running':    return this.renderRunning()
      case 'success':    return this.renderSuccess()
      case 'no-changes': return this.renderNoChanges()
      case 'error':      return this.renderError()
      default:           return this.renderInspect()
    }
  }

  // ── inspect state ────────────────────────────────────────────────────────────

  private renderInspect(): void {
    const ctx = this.ctx!
    const { fiber, tag, id, classList, computedStyles, rect } = ctx

    const componentName = fiber.componentName ?? tag
    const sourceFile = fiber.sourceFile ?? this.resolvedSource?.file ?? null
    const sourceLine = fiber.sourceLine ?? this.resolvedSource?.line ?? null
    const shortFile = sourceFile ? sourceFile.split('/').slice(-2).join('/') : null
    const badgeLabel = fiber.componentName ? tag : tag.toUpperCase()

    let pathHtml: string
    if (shortFile) {
      pathHtml = `<div class="ip-path" data-action="open-vscode" title="在 VS Code 中打开">${shortFile}:${sourceLine}</div>`
    } else if (this.sourceLookupPending) {
      pathHtml = `<div class="ip-path" style="cursor:default;color:rgba(255,255,255,0.3)">⏳ 定位中…</div>`
    } else {
      const deg = this.anchorEl ? getDegradedInfo(this.anchorEl) : null
      const domPath = deg?.domPath ?? `${tag}${classList[0] ? '.' + classList[0] : ''}`
      const testId = deg?.dataTestId ? ` · testid:${deg.dataTestId}` : ''
      pathHtml = `<div class="ip-path" style="cursor:default;color:rgba(255,255,255,0.25);margin-top:2px">${this.escapeHtml(domPath)}${testId}</div>`
    }

    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    const x = Math.round(rect.left)
    const y = Math.round(rect.top)
    const dimProps = [
      { k: '宽', v: `${w}` }, { k: '高', v: `${h}` },
      { k: 'X', v: `${x}` }, { k: 'Y', v: `${y}` },
    ]

    const styleEntries: Array<{ k: string; v: string; color?: string }> = []
    const bg = computedStyles['backgroundColor'] ?? ''
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      styleEntries.push({ k: '背景', v: this.colorToHex(bg), color: bg })
    }
    const radius = computedStyles['borderRadius']
    if (radius && radius !== '0px') styleEntries.push({ k: '圆角', v: radius })
    const padding = computedStyles['padding']
    if (padding && padding !== '0px') styleEntries.push({ k: '内距', v: padding })
    const shadow = computedStyles['boxShadow']
    if (shadow && shadow !== 'none') styleEntries.push({ k: '阴影', v: shadow.slice(0, 20) + '…' })

    const fontEntries: Array<{ k: string; v: string; color?: string }> = []
    const ff = computedStyles['fontFamily']
    if (ff) fontEntries.push({ k: '字体', v: ff.split(',')[0].replace(/['"]/g, '').trim() })
    const fs = computedStyles['fontSize']
    if (fs) fontEntries.push({ k: '字号', v: fs })
    const fw = computedStyles['fontWeight']
    if (fw) fontEntries.push({ k: '字重', v: fw })
    const color = computedStyles['color'] ?? ''
    if (color) fontEntries.push({ k: '颜色', v: this.colorToHex(color), color })

    const renderProps = (entries: Array<{ k: string; v: string; color?: string }>): string =>
      entries.map(({ k, v, color: c }) => `
        <div class="ip-prop">
          ${c ? `<div class="ip-prop-swatch" style="background:${c}"></div>` : ''}
          <span class="ip-prop-k">${k}</span>
          <span class="ip-prop-v">${this.escapeHtml(v)}</span>
        </div>`).join('')

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="ip-header">
          <div class="ip-badge">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/></svg>
            ${badgeLabel}
          </div>
          <div class="ip-name">${this.escapeHtml(componentName)}</div>
          ${pathHtml}
        </div>

        <div class="ip-section">
          <div class="ip-sec-title">尺寸</div>
          <div class="ip-props">${renderProps(dimProps)}</div>
        </div>

        ${styleEntries.length ? `
        <div class="ip-section">
          <div class="ip-sec-title">样式</div>
          <div class="ip-props">${renderProps(styleEntries)}</div>
        </div>` : ''}

        ${fontEntries.length ? `
        <div class="ip-section">
          <div class="ip-sec-title">字体</div>
          <div class="ip-props">${renderProps(fontEntries)}</div>
        </div>` : ''}

        <div class="ip-chat">
          <div class="ip-chat-input">
            <textarea class="ip-textarea" placeholder="写开发需求…"></textarea>
            <div class="ip-chat-btns">
              <button class="ip-btn-sm ghost" data-action="cancel-text">取消</button>
              <button class="ip-btn-sm primary" data-action="develop">开发</button>
            </div>
          </div>
        </div>
      </div>
    `

    this.bindInspectEvents(sourceFile, sourceLine)
    this.dragCleanup?.()
    const header = this.shadow.querySelector<HTMLElement>('.ip-header')
    if (header) this.dragCleanup = makePanelDraggable(header, this.host)
  }

  // ── running state ────────────────────────────────────────────────────────────

  private renderRunning(): void {
    const snap = this.taskSnapshot!
    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="ip-task-header">
          <span class="ip-task-title">开发任务</span>
          <button class="ip-task-cancel" data-action="task-cancel">✕ 取消</button>
        </div>
        <div class="ip-task-snapshot">
          <div class="ip-task-elem">${this.escapeHtml(snap.elementLabel)}</div>
          <div class="ip-task-msg">${this.escapeHtml(snap.userMessage)}</div>
        </div>
        <div class="ip-task-status">
          <div class="ip-spinner"></div>
          <span>${this.runningStatus === 'editing' ? '修改文件中…' : '分析代码中…'}</span>
        </div>
      </div>
    `
    this.shadow.querySelector<HTMLButtonElement>('[data-action="task-cancel"]')
      ?.addEventListener('click', () => {
        if (this.taskId) {
          wsClient.send({ type: 'design:cancel', id: this.taskId })
          this.taskId = null
        }
        this.state = 'inspect'
        this.runningStatus = 'analyzing'
        this.taskSnapshot = null
        this.renderPanel()
      })
  }

  // ── success state ─────────────────────────────────────────────────────────────

  private renderSuccess(): void {
    const snap = this.taskSnapshot!
    const result = this.taskResult!
    const filesHtml = result.changedFiles.length
      ? result.changedFiles.map((f) => {
          const short = f.split('/').slice(-2).join('/')
          return `<div class="ip-result-file" data-file="${this.escapeHtml(f)}">📄 ${this.escapeHtml(short)}</div>`
        }).join('')
      : ''

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="ip-task-header">
          <span class="ip-task-title">开发完成</span>
        </div>
        <div class="ip-task-snapshot">
          <div class="ip-task-elem">${this.escapeHtml(snap.elementLabel)}</div>
          <div class="ip-task-msg">${this.escapeHtml(snap.userMessage)}</div>
        </div>
        <div class="ip-result-body">
          <div class="ip-result-icon">✅</div>
          <div class="ip-result-summary">${this.escapeHtml(result.summary)}</div>
          ${filesHtml ? `<div class="ip-result-files">${filesHtml}</div>` : ''}
          <div class="ip-result-actions">
            <button class="ip-btn-sm ghost" data-action="resume-inspect">继续审查</button>
          </div>
        </div>
      </div>
    `

    // Click file → open in VS Code
    this.shadow.querySelectorAll<HTMLElement>('[data-file]').forEach((el) => {
      el.addEventListener('click', () => {
        const file = el.getAttribute('data-file')
        if (file) openInVSCode(file, 1)
      })
    })

    this.shadow.querySelector<HTMLButtonElement>('[data-action="resume-inspect"]')
      ?.addEventListener('click', () => {
        this.state = 'inspect'
        this.taskSnapshot = null
        this.taskResult = null
        this.notifyTaskEnd()
        if (this.ctx && this.anchorEl) {
          this.renderPanel()
        } else {
          this.hide()
        }
      })
  }

  // ── no-changes state ─────────────────────────────────────────────────────────

  private renderNoChanges(): void {
    const snap = this.taskSnapshot!
    const result = this.taskResult!

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="ip-task-header">
          <span class="ip-task-title">未修改文件</span>
        </div>
        <div class="ip-task-snapshot">
          <div class="ip-task-elem">${this.escapeHtml(snap.elementLabel)}</div>
          <div class="ip-task-msg">${this.escapeHtml(snap.userMessage)}</div>
        </div>
        <div class="ip-result-body">
          <div class="ip-result-icon">⚠️</div>
          <div class="ip-result-summary">${this.escapeHtml(result.summary)}</div>
          <div class="ip-result-actions">
            <button class="ip-btn-sm ghost" data-action="resume-inspect">继续审查</button>
          </div>
        </div>
      </div>
    `

    this.shadow.querySelector<HTMLButtonElement>('[data-action="resume-inspect"]')
      ?.addEventListener('click', () => {
        this.state = 'inspect'
        this.taskSnapshot = null
        this.taskResult = null
        this.notifyTaskEnd()
        if (this.ctx && this.anchorEl) {
          this.renderPanel()
        } else {
          this.hide()
        }
      })
  }

  // ── error state ───────────────────────────────────────────────────────────────

  private renderError(): void {
    const snap = this.taskSnapshot
    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="ip-task-header">
          <span class="ip-task-title">开发失败</span>
        </div>
        ${snap ? `
        <div class="ip-task-snapshot">
          <div class="ip-task-elem">${this.escapeHtml(snap.elementLabel)}</div>
          <div class="ip-task-msg">${this.escapeHtml(snap.userMessage)}</div>
        </div>` : ''}
        <div class="ip-error-body">
          <div class="ip-error-icon">❌</div>
          <div class="ip-error-msg">${this.escapeHtml(this.taskError ?? '未知错误')}</div>
          <div class="ip-error-actions">
            <button class="ip-btn-sm ghost" data-action="resume-inspect">返回</button>
            ${snap ? `<button class="ip-btn-sm primary" data-action="retry">重试</button>` : ''}
          </div>
        </div>
      </div>
    `

    this.shadow.querySelector<HTMLButtonElement>('[data-action="resume-inspect"]')
      ?.addEventListener('click', () => {
        this.state = 'inspect'
        this.taskSnapshot = null
        this.taskError = null
        this.notifyTaskEnd()
        if (this.ctx && this.anchorEl) {
          this.renderPanel()
        } else {
          this.hide()
        }
      })

    this.shadow.querySelector<HTMLButtonElement>('[data-action="retry"]')
      ?.addEventListener('click', () => {
        if (!snap) return
        this.state = 'inspect'
        this.taskError = null
        this.sendDevelopRequest(snap.userMessage, snap.element)
      })
  }

  // ── shared helpers ────────────────────────────────────────────────────────────

  private bindInspectEvents(sourceFile: string | null, sourceLine: number | null): void {
    const pathEl = this.shadow.querySelector('[data-action="open-vscode"]')
    if (pathEl && sourceFile) {
      pathEl.addEventListener('click', () => openInVSCode(sourceFile, sourceLine ?? 1))
    }

    const textarea = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.triggerDevelop()
      } else if (e.key === 'Escape') {
        if (textarea) { textarea.value = ''; textarea.style.height = '' }
      }
    })
    textarea?.addEventListener('input', () => {
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, 80)}px`
      }
    })

    this.shadow.querySelector<HTMLButtonElement>('[data-action="develop"]')
      ?.addEventListener('click', () => this.triggerDevelop())

    this.shadow.querySelector<HTMLButtonElement>('[data-action="cancel-text"]')
      ?.addEventListener('click', () => {
        const ta = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
        if (ta) { ta.value = ''; ta.style.height = '' }
      })

  }

  private triggerDevelop(): void {
    const textarea = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
    const text = textarea?.value.trim()
    if (!text || !this.ctx) return
    if (textarea) textarea.value = ''

    const { tag, id, classList, computedStyles, textContent, fiber } = this.ctx
    const element = {
      tag, id, classList, textContent, computedStyles,
      sourceFile: fiber.sourceFile,
      sourceLine: fiber.sourceLine,
    }
    this.sendDevelopRequest(text, element)
  }

  private sendDevelopRequest(userMessage: string, element: Record<string, unknown>): void {
    const sourceFile = (element['sourceFile'] as string | undefined) ?? this.resolvedSource?.file ?? null
    const sourceLine = (element['sourceLine'] as number | undefined) ?? this.resolvedSource?.line ?? null
    const tag = element['tag'] as string
    const classList = element['classList'] as string[]

    const elementLabel = sourceFile
      ? `${tag}${classList[0] ? '.' + classList[0] : ''} · ${sourceFile.split('/').slice(-1)[0]}${sourceLine ? ':' + sourceLine : ''}`
      : `${tag}${classList[0] ? '.' + classList[0] : ''}`

    this.taskSnapshot = { elementLabel, sourceFile, sourceLine, userMessage, element }

    const { computedStyles: _dropped, ...trimmedElement } = element as Record<string, unknown> & { computedStyles?: unknown }
    wsClient.send({
      type: 'design:request',
      action: 'develop',
      userMessage,
      element: trimmedElement,
      pageUrl: window.location.href,
    })
  }

  private colorToHex(color: string): string {
    const m = color.match(/\d+/g)
    if (!m || m.length < 3) return color
    const hex = m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')
    return '#' + hex.toUpperCase()
  }


  private escapeHtml(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }

  destroy(): void {
    this.wsUnsubscribe?.()
    this.host.remove()
  }
}

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
    this.selectedHighlight = getOrCreateHighlight(SELECTED_HIGHLIGHT_ID, SELECTED_COLOR, SELECTED_RGB)
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
