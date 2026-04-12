/**
 * Comment mode — add element-level comments on DOM elements.
 * Shift+click for batch commenting.
 * Comments render as floating bubbles anchored to elements.
 */

import { changeTracker } from './changes'

// ─── Comment bubble ───────────────────────────────────────────────────────────

const BUBBLE_STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .badge {
    width: 20px; height: 20px; border-radius: 50%;
    background: #8B5CF6; color: white;
    font-size: 10px; font-weight: 700; line-height: 20px; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    cursor: pointer; user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    transition: transform 0.1s, background 0.1s;
  }
  .badge:hover { transform: scale(1.15); background: #7c3aed; }
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
  private host: HTMLElement
  private shadow: ShadowRoot
  private commentId: string
  private popupOpen = false

  constructor(commentId: string, text: string, anchorEl: Element, index: number) {
    this.commentId = commentId
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'comment-bubble')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `
      <style>${BUBBLE_STYLES}</style>
      <div class="badge">${index}</div>
      <div class="popup" style="display:none">
        <div class="popup-text">${this.escapeHtml(text)}</div>
        <button class="del-btn">删除评论</button>
      </div>
    `
    this.host.style.cssText = 'position: fixed; z-index: 2147483644; pointer-events: all;'

    this.shadow.querySelector('.badge')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.togglePopup()
    })
    this.shadow.querySelector('.del-btn')?.addEventListener('click', () => this.remove())

    // Click outside to close popup
    document.addEventListener('click', () => {
      if (this.popupOpen) this.closePopup()
    })

    document.body.appendChild(this.host)
    this.position(anchorEl)

    window.addEventListener('scroll', () => this.position(anchorEl), { passive: true })
    window.addEventListener('resize', () => this.position(anchorEl), { passive: true })
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
    // Badge sits at top-right corner of element (offset 10px outward)
    Object.assign(this.host.style, {
      position: 'fixed',
      top: `${rect.top - 10}px`,
      left: `${rect.right - 10}px`,
      zIndex: '2147483644',
    })
  }

  remove(): void {
    changeTracker.removeComment(this.commentId)
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
    background: rgba(255,255,255,0.88);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.6);
    border-radius: 14px;
    padding: 12px 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    width: 260px;
    z-index: 2147483645;
  }
  textarea {
    width: 100%;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-family: inherit;
    resize: none;
    outline: none;
    background: rgba(255,255,255,0.7);
    color: #1c1c1e;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  textarea:focus { border-color: #007AFF; }
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
  .cancel { background: rgba(0,0,0,0.07); color: #1c1c1e; }
  .cancel:hover { background: rgba(0,0,0,0.12); }
  .confirm { background: #007AFF; color: white; }
  .confirm:hover { background: #0063CC; }
`

export function showCommentDialog(
  x: number,
  y: number,
  onConfirm: (text: string) => void,
): void {
  const host = document.createElement('div')
  host.setAttribute('data-design-easily', 'comment-dialog')
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

  const ta = shadow.querySelector<HTMLTextAreaElement>('textarea')
  shadow.querySelector('.cancel')?.addEventListener('click', () => host.remove())
  shadow.querySelector('.confirm')?.addEventListener('click', () => {
    const text = ta?.value.trim()
    if (text) {
      onConfirm(text)
      host.remove()
    }
  })

  ta?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = ta.value.trim()
      if (text) { onConfirm(text); host.remove() }
    }
    if (e.key === 'Escape') host.remove()
  })

  document.body.appendChild(host)
  setTimeout(() => ta?.focus(), 0)
}

