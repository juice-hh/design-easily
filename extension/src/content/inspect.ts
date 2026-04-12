/**
 * Inspect mode — hover highlight + click to select + right-side info panel.
 * Frosted glass Apple-style UI.
 */

import { extractFiberInfo, getComponentBreadcrumb, type FiberInfo } from './fiber'
import { wsClient } from './ws'
import { requestHistory } from './requestHistory.js'
import { changeTracker } from './changes.js'
import { CommentBubble } from './comment.js'
import { makePanelDraggable } from './draggable.js'

// ─── Highlight overlay ────────────────────────────────────────────────────────

const HIGHLIGHT_ID = 'de-highlight-overlay'

function getOrCreateHighlight(): HTMLElement {
  let el = document.getElementById(HIGHLIGHT_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = HIGHLIGHT_ID
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483640',
      border: '2px solid #8B5CF6',
      borderRadius: '4px',
      background: 'rgba(139, 92, 246, 0.06)',
      transition: 'all 0.08s ease',
      display: 'none',
      boxSizing: 'border-box',
    })
    document.body.appendChild(el)
  }
  return el
}

function positionHighlight(el: HTMLElement, target: Element, componentName?: string): void {
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
      background: '#8B5CF6',
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
  const name = componentName ?? (target as HTMLElement).tagName?.toLowerCase()
  if (name) {
    label.textContent = name
    label.style.display = 'block'
    // If element is near top of viewport, show label below instead of above
    if (rect.top < 26) {
      label.style.top = '100%'
      label.style.bottom = ''
      label.style.borderRadius = '0 4px 4px 4px'
    } else {
      label.style.bottom = '100%'
      label.style.top = ''
      label.style.borderRadius = '4px 4px 4px 0'
    }
  } else {
    label.style.display = 'none'
  }
}

function hideHighlight(): void {
  const el = document.getElementById(HIGHLIGHT_ID)
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
    background: rgba(255,255,255,0.9); border-color: transparent; color: #1c1c1e;
  }
  .ip-btn.dark:hover { background: white; }
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
  .ip-btn-sm.primary { background: #007AFF; color: white; border: none; }
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
    background: rgba(255,255,255,0.9); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background 0.12s;
  }
  .ip-send:hover { background: white; }
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
`

export class InspectPanel {
  private host: HTMLElement
  private shadow: ShadowRoot
  private ctx: ElementContext | null = null
  private messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  private pendingRequestId: string | null = null
  private pendingAction: 'suggest' | 'develop' | null = null
  private pendingUserMessage: string | null = null
  private wsUnsubscribe: (() => void) | null = null
  private commentBubbles: CommentBubble[] = []
  private dragCleanup: (() => void) | null = null

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'panel')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `<style>${PANEL_STYLES}</style>`
    this.host.style.display = 'none'
    document.body.appendChild(this.host)

    this.wsUnsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === 'design:queued') {
        this.pendingRequestId = msg.id
        this.updateLastAssistantMessage('⏳ 已发送，等待 Claude Code...')
        if (this.pendingAction !== null && this.pendingUserMessage !== null) {
          requestHistory.add({
            id: msg.id,
            action: this.pendingAction,
            userMessage: this.pendingUserMessage,
            status: 'pending',
          })
          this.pendingAction = null
          this.pendingUserMessage = null
        }
      }
      if (msg.type === 'design:processing') {
        if (msg.id !== this.pendingRequestId) return
        this.updateLastAssistantMessage('⚙️ Claude Code 处理中...')
      }
      if (msg.type === 'design:done') {
        if (msg.id !== this.pendingRequestId) return
        const text = msg.action === 'suggest'
          ? (msg.content ?? '(未返回内容)')
          : `✅ 已修改：${(msg.changedFiles ?? []).join(', ') || (msg.summary ?? '完成')}`
        this.updateLastAssistantMessage(text)
        this.pendingRequestId = null
        this.setButtonsDisabled(false)
      }
      if (msg.type === 'design:failed') {
        if (msg.id !== this.pendingRequestId) return
        this.updateLastAssistantMessage(`❌ 失败：${msg.error}`)
        this.pendingRequestId = null
        this.setButtonsDisabled(false)
      }
    })
  }

  show(ctx: ElementContext): void {
    this.ctx = ctx
    this.host.style.display = ''
    this.renderPanel()
  }

  hide(): void {
    this.host.style.display = 'none'
    this.ctx = null
  }

  private renderPanel(): void {
    const ctx = this.ctx!
    const { fiber, tag, id, classList, computedStyles, rect } = ctx

    const componentName = fiber.componentName ?? tag
    const sourceFile = fiber.sourceFile
    const sourceLine = fiber.sourceLine
    const shortFile = sourceFile ? sourceFile.split('/').slice(-2).join('/') : null

    // Badge label: prefer component tag type, fallback to element tag
    const badgeLabel = fiber.componentName ? tag : tag.toUpperCase()

    // Header path
    const pathHtml = shortFile
      ? `<div class="ip-path" data-action="open-vscode" title="在 VS Code 中打开">${shortFile}:${sourceLine}</div>`
      : `<div class="ip-path" style="cursor:default;color:rgba(255,255,255,0.2)">未检测到源码（需 React 开发模式）</div>`

    // 尺寸 section
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    const x = Math.round(rect.left)
    const y = Math.round(rect.top)
    const dimProps = [
      { k: '宽', v: `${w}` }, { k: '高', v: `${h}` },
      { k: 'X', v: `${x}` }, { k: 'Y', v: `${y}` },
    ]

    // 样式 section: bg, radius, padding, shadow
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

    // 字体 section
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

    const messagesHtml = this.messages.map((m) =>
      `<div class="msg ${m.role}">${this.escapeHtml(m.content)}</div>`
    ).join('')

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
          <div class="ip-chat-title">评论</div>
          ${messagesHtml ? `<div class="ip-chat-msgs">${messagesHtml}</div>` : ''}
          <div class="ip-chat-input">
            <textarea class="ip-textarea" placeholder="写评论或开发需求…"></textarea>
            <div class="ip-chat-btns">
              <button class="ip-btn-sm ghost" data-action="cancel">取消</button>
              <button class="ip-btn-sm secondary" data-action="comment">评论</button>
              <button class="ip-btn-sm primary" data-action="develop">开发</button>
            </div>
          </div>
        </div>
      </div>
    `

    this.bindEvents()
    this.scrollChatToBottom()

    // Re-attach drag handle after every re-render
    this.dragCleanup?.()
    const header = this.shadow.querySelector<HTMLElement>('.ip-header')
    if (header) this.dragCleanup = makePanelDraggable(header, this.host)
  }

  private colorToHex(color: string): string {
    const m = color.match(/\d+/g)
    if (!m || m.length < 3) return color
    const hex = m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')
    return '#' + hex.toUpperCase()
  }

  private bindEvents(): void {
    const pathEl = this.shadow.querySelector('[data-action="open-vscode"]')
    if (pathEl && this.ctx?.fiber.sourceFile) {
      pathEl.addEventListener('click', () => {
        wsClient.send({
          type: 'vscode:open',
          file: this.ctx!.fiber.sourceFile!,
          line: this.ctx!.fiber.sourceLine ?? 1,
        })
      })
    }

    const textarea = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.sendDesignRequest('develop')
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
      ?.addEventListener('click', () => this.sendDesignRequest('develop'))

    this.shadow.querySelector<HTMLButtonElement>('[data-action="cancel"]')
      ?.addEventListener('click', () => {
        const ta = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
        if (ta) { ta.value = ''; ta.style.height = '' }
      })

    this.shadow.querySelector<HTMLButtonElement>('[data-action="comment"]')
      ?.addEventListener('click', () => {
        const ta = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
        const text = ta?.value.trim()
        if (!text || !this.ctx) return
        const fiber = this.ctx.fiber
        const sel = this.ctx.id ? `#${this.ctx.id}` : `${this.ctx.tag}${this.ctx.classList[0] ? '.' + this.ctx.classList[0] : ''}`
        changeTracker.addComment({ selector: sel, componentName: fiber.componentName, text })
        const stored = changeTracker.getComments()
        const latest = stored[stored.length - 1]
        const targetEl = document.querySelector(sel)
        if (targetEl && latest) {
          this.commentBubbles.push(new CommentBubble(latest.id, text, targetEl))
        }
        if (ta) { ta.value = ''; ta.style.height = '' }
      })
  }

  private sendDesignRequest(action: 'suggest' | 'develop'): void {
    const textarea = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
    const text = textarea?.value.trim()
    if (!text || this.pendingRequestId) return

    this.pendingAction = action
    this.pendingUserMessage = text

    this.addMessage('user', text)
    if (textarea) textarea.value = ''

    this.addMessage('assistant', '⏳ 发送中...')
    this.setButtonsDisabled(true)

    const { tag, id, classList, computedStyles, textContent, fiber } = this.ctx!
    wsClient.send({
      type: 'design:request',
      action,
      userMessage: text,
      element: {
        tag,
        id,
        classList,
        textContent,
        computedStyles,
        sourceFile: fiber.sourceFile,
        sourceLine: fiber.sourceLine,
      },
    })
  }

  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.push({ role, content })
    this.renderPanel()
  }

  private updateLastAssistantMessage(content: string): void {
    const lastIdx = this.messages.length - 1
    if (lastIdx >= 0 && this.messages[lastIdx].role === 'assistant') {
      this.messages[lastIdx].content = content
      const msgs = this.shadow.querySelectorAll('.msg.assistant')
      const last = msgs[msgs.length - 1]
      if (last) last.textContent = content
      this.scrollChatToBottom()
    }
  }

  private scrollChatToBottom(): void {
    const chatMsgs = this.shadow.querySelector('.ip-chat-msgs')
    if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight
  }

  private setButtonsDisabled(disabled: boolean): void {
    const btns = this.shadow.querySelectorAll<HTMLButtonElement>('[data-action="develop"],[data-action="comment"]')
    btns.forEach((btn) => { btn.disabled = disabled })
  }

  private escapeHtml(text: string): string {
    return text
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
  private highlight: HTMLElement
  private selectedEl: Element | null = null
  private active = false

  constructor() {
    this.panel = new InspectPanel()
    this.highlight = getOrCreateHighlight()
  }

  enable(): void {
    this.active = true
    document.addEventListener('mouseover', this.onHover, true)
    document.addEventListener('click', this.onClick, true)
    document.body.style.cursor = 'crosshair'
  }

  disable(): void {
    this.active = false
    document.removeEventListener('mouseover', this.onHover, true)
    document.removeEventListener('click', this.onClick, true)
    document.body.style.cursor = ''
    hideHighlight()
    this.panel.hide()
    this.selectedEl = null
  }

  private onHover = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return

    const fiber = extractFiberInfo(target)
    const name = fiber.componentName ?? target.tagName.toLowerCase()
    positionHighlight(this.highlight, target, name)
  }

  private onClick = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return

    e.preventDefault()
    e.stopPropagation()

    this.selectedEl = target
    const ctx = buildContext(target)
    this.panel.show(ctx)
  }

  destroy(): void {
    this.disable()
    this.panel.destroy()
    this.highlight.remove()
  }
}
