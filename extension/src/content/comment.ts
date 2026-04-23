/**
 * Comment mode — add element-level comments on DOM elements.
 * Comments render as floating bubbles anchored to elements.
 */

import { changeTracker } from './changes'

// ─── Comment bubble ───────────────────────────────────────────────────────────

import { ACCENT, ACCENT_HOVER, Z } from './tokens.js'

const BUBBLE_STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .badge {
    width: 20px; height: 20px; border-radius: 50%;
    background: ${ACCENT}; color: white;
    font-size: 10px; font-weight: 700; line-height: 20px; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    cursor: pointer; user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    transition: transform 0.1s, background 0.1s;
    border: none; padding: 0; outline-offset: 2px;
  }
  .badge:hover { transform: scale(1.15); background: ${ACCENT_HOVER}; }
  .popup {
    position: absolute;
    top: 26px; right: 0;
    background: rgba(28,28,30,0.92);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 10px 12px;
    min-width: 160px; max-width: 240px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    z-index: 1;
  }
  .popup-text {
    font-size: 12px; color: rgba(255,255,255,0.85);
    line-height: 1.5; word-break: break-word; margin-bottom: 8px;
  }
  .del-btn {
    display: block; width: 100%; padding: 4px 0;
    background: transparent; border: 1px solid rgba(255,59,48,0.35);
    border-radius: 5px; font-size: 11px; color: #FF453A;
    cursor: pointer; font-family: inherit;
    transition: background 0.12s;
  }
  .del-btn:hover { background: rgba(255,59,48,0.12); }
`

export class CommentBubble {
  private readonly host: HTMLElement
  private readonly shadow: ShadowRoot
  private readonly commentId: string
  private popupOpen = false
  private readonly onDocClick: () => void
  private readonly onScroll: () => void
  private readonly onResize: () => void

  constructor(commentId: string, text: string, anchorEl: Element, index: number) {
    this.commentId = commentId
    this.host = document.createElement('div')
    this.host.dataset['designEasily'] = 'comment-bubble'
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `
      <style>${BUBBLE_STYLES}</style>
      <button class="badge" aria-label="评论 ${index}，点击展开">${index}</button>
      <div class="popup" role="dialog" aria-label="评论详情" style="display:none">
        <div class="popup-text">${this.escapeHtml(text)}</div>
        <button class="del-btn">删除评论</button>
      </div>
    `
    this.host.style.cssText = `position: fixed; z-index: ${Z.COMMENT_BUBBLE}; pointer-events: all;`

    this.shadow.querySelector('.badge')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.togglePopup()
    })
    this.shadow.querySelector('.del-btn')?.addEventListener('click', () => this.remove())

    this.onDocClick = () => { if (this.popupOpen) this.closePopup() }
    this.onScroll = () => this.position(anchorEl)
    this.onResize = () => this.position(anchorEl)

    document.addEventListener('click', this.onDocClick)
    document.body.appendChild(this.host)
    this.position(anchorEl)

    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('resize', this.onResize, { passive: true })
  }

  private togglePopup(): void {
    this.popupOpen = !this.popupOpen
    const popup = this.shadow.querySelector<HTMLElement>('.popup')
    if (popup) popup.style.display = this.popupOpen ? 'block' : 'none'
  }

  private closePopup(): void {
    this.popupOpen = false
    const popup = this.shadow.querySelector<HTMLElement>('.popup')
    if (popup) popup.style.display = 'none'
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  position(anchorEl: Element): void {
    const rect = anchorEl.getBoundingClientRect()
    const POPUP_W = 240
    const BADGE_W = 20
    const vw = window.innerWidth

    // Preferred badge position: top-right corner of element
    let hostLeft = rect.right - 10

    // Decide popup direction before clamping
    const expandRight = hostLeft + POPUP_W <= vw

    if (expandRight) {
      // Clamp so popup right edge stays inside viewport
      hostLeft = Math.min(hostLeft, vw - POPUP_W)
    } else {
      // Clamp so popup left edge (hostLeft + BADGE_W - POPUP_W) stays >= 0
      hostLeft = Math.max(hostLeft, POPUP_W - BADGE_W)
    }

    // Keep badge itself within viewport
    hostLeft = Math.max(0, Math.min(hostLeft, vw - BADGE_W))

    Object.assign(this.host.style, {
      position: 'fixed',
      top: `${rect.top - 10}px`,
      left: `${hostLeft}px`,
      zIndex: String(Z.COMMENT_BUBBLE),
    })

    const popup = this.shadow.querySelector<HTMLElement>('.popup')
    if (popup) {
      if (expandRight) {
        popup.style.left = '0'
        popup.style.right = 'auto'
      } else {
        popup.style.left = 'auto'
        popup.style.right = '0'
      }
    }
  }

  remove(): void {
    changeTracker.removeComment(this.commentId)
    document.removeEventListener('click', this.onDocClick)
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('resize', this.onResize)
    this.host.remove()
  }
}

// ─── Comment input dialog ─────────────────────────────────────────────────────

const DIALOG_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
  }
  .dialog {
    position: fixed;
    background: rgba(28, 28, 30, 0.88);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 12px 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
    width: 260px;
    z-index: ${Z.DIALOG};
  }
  textarea {
    width: 100%;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-family: inherit;
    resize: none;
    outline: none;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.9);
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  textarea::placeholder { color: rgba(255,255,255,0.3); }
  textarea:focus { border-color: ${ACCENT}; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
  }
  button {
    font-size: 12px;
    font-family: inherit;
    padding: 5px 12px;
    border-radius: 7px;
    border: none;
    cursor: pointer;
    font-weight: 500;
  }
  .cancel { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
  .cancel:hover { background: rgba(255,255,255,0.16); }
  .confirm { background: ${ACCENT}; color: white; }
  .confirm:hover { background: ${ACCENT_HOVER}; }
`

export function showCommentDialog(
  x: number,
  y: number,
  onConfirm: (text: string) => void,
  onClose?: () => void,
): void {
  const host = document.createElement('div')
  host.dataset['designEasily'] = 'comment-dialog'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>${DIALOG_STYLES}</style>
    <div class="dialog" style="top:${y}px;left:${x}px">
      <textarea placeholder="添加评论..." rows="3" autofocus></textarea>
      <div class="actions">
        <button class="cancel">取消</button>
        <button class="confirm">添加</button>
      </div>
    </div>
  `

  const close = (): void => { host.remove(); onClose?.() }
  const ta = shadow.querySelector<HTMLTextAreaElement>('textarea')
  shadow.querySelector('.cancel')?.addEventListener('click', close)
  shadow.querySelector('.confirm')?.addEventListener('click', () => {
    const text = ta?.value.trim()
    if (text) {
      onConfirm(text)
      host.remove()
      onClose?.()
    }
  })

  ta?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = ta.value.trim()
      if (text) { onConfirm(text); host.remove(); onClose?.() }
    }
    if (e.key === 'Escape') close()
  })

  document.body.appendChild(host)
  setTimeout(() => ta?.focus(), 0)
}

// ─── Comment mode controller ──────────────────────────────────────────────────

const COMMENT_HOVER_COLOR = '#8B5CF6'
const COMMENT_HOVER_RGB   = '139, 92, 246'
const COMMENT_HIGHLIGHT_ID = 'de-comment-hover'

function getOrCreateCommentHighlight(): HTMLElement {
  const existing = document.getElementById(COMMENT_HIGHLIGHT_ID)
  if (existing) return existing
  const el = document.createElement('div')
  el.id = COMMENT_HIGHLIGHT_ID
  el.dataset['designEasily'] = 'comment-highlight'
  Object.assign(el.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: String(Z.COMMENT_HIGHLIGHT),
    display: 'none',
    outline: `2px dashed ${COMMENT_HOVER_COLOR}`,
    outlineOffset: '2px',
    background: `rgba(${COMMENT_HOVER_RGB}, 0.06)`,
    borderRadius: '3px',
    boxSizing: 'border-box',
  })
  document.body.appendChild(el)
  return el
}

function positionCommentHighlight(el: HTMLElement, target: Element): void {
  const rect = target.getBoundingClientRect()
  Object.assign(el.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

export class CommentMode {
  private readonly highlight: HTMLElement
  private bubbles: CommentBubble[] = []
  private active = false

  constructor() {
    this.highlight = getOrCreateCommentHighlight()
  }

  enable(): void {
    this.active = true
    document.addEventListener('mouseover', this.onHover, true)
    document.addEventListener('click', this.onClick, true)
    document.body.style.cursor = 'cell'
  }

  disable(): void {
    this.active = false
    document.removeEventListener('mouseover', this.onHover, true)
    document.removeEventListener('click', this.onClick, true)
    document.body.style.cursor = ''
    this.highlight.style.display = 'none'
    // 关闭任何仍然打开的评论对话框，防止 onClose 在模式切换后重新注册监听器
    document.querySelectorAll('[data-design-easily="comment-dialog"]').forEach((el) => el.remove())
  }

  destroy(): void {
    this.disable()
    this.highlight.remove()
    this.bubbles.forEach((b) => b.remove())
    this.bubbles = []
  }

  private readonly onHover = (e: MouseEvent): void => {
    const target = e.target as HTMLElement
    if (!target || target.dataset['designEasily']) return
    positionCommentHighlight(this.highlight, target)
  }

  private readonly onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement
    if (!target || target.dataset['designEasily']) return

    e.preventDefault()
    e.stopPropagation()

    // Lock highlight on the clicked element; stop hover from moving it
    positionCommentHighlight(this.highlight, target)
    document.removeEventListener('mouseover', this.onHover, true)
    document.removeEventListener('click', this.onClick, true)

    const rect = target.getBoundingClientRect()
    const dialogX = Math.min(rect.right + 8, window.innerWidth - 280)
    const dialogY = rect.top

    showCommentDialog(dialogX, dialogY, (text) => {
      const tag = target.tagName.toLowerCase()
      const cls = target.className ? `.${[...target.classList].join('.')}` : ''
      const selector = target.id ? `#${target.id}` : tag + cls

      const stored = changeTracker.getComments()
      const comment = changeTracker.addComment({
        selector,
        componentName: null,
        text,
      })
      const index = stored.length + 1
      const bubble = new CommentBubble(comment.id, text, target, index)
      this.bubbles.push(bubble)
    }, () => {
      // 只在评论模式仍然激活时恢复监听器（防止模式切换后泄漏）
      if (!this.active) return
      this.highlight.style.display = 'none'
      document.addEventListener('mouseover', this.onHover, true)
      document.addEventListener('click', this.onClick, true)
    })
  }
}

