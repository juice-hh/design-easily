/**
 * Comment mode — add element-level comments on DOM elements.
 * Shift+click for batch commenting.
 * Comments render as floating bubbles anchored to elements.
 */

import { extractFiberInfo } from './fiber'
import { changeTracker } from './changes'

function buildSelector(el: Element): string {
  if (el.id) return `#${el.id}`
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).slice(0, 2).join('.')
  return classes ? `${tag}.${classes}` : tag
}

// ─── Comment bubble ───────────────────────────────────────────────────────────

const BUBBLE_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
  }
  .bubble {
    position: fixed;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 10px;
    padding: 8px 12px;
    max-width: 240px;
    font-size: 12px;
    color: #1c1c1e;
    line-height: 1.4;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    cursor: default;
    user-select: none;
    z-index: 2147483644;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .bubble-text {
    flex: 1;
    word-break: break-word;
  }
  .bubble-del {
    flex-shrink: 0;
    font-size: 14px;
    color: rgba(0,0,0,0.3);
    cursor: pointer;
    line-height: 1;
    margin-top: -1px;
  }
  .bubble-del:hover { color: #FF3B30; }
`

class CommentBubble {
  private host: HTMLElement
  private shadow: ShadowRoot
  private commentId: string

  constructor(commentId: string, text: string, anchorEl: Element) {
    this.commentId = commentId
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'comment-bubble')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `
      <style>${BUBBLE_STYLES}</style>
      <div class="bubble">
        <span class="bubble-text">${text}</span>
        <span class="bubble-del" title="删除">×</span>
      </div>
    `
    this.host.style.cssText = 'position: fixed; z-index: 2147483644; pointer-events: none;'
    this.shadow.querySelector('.bubble-del')?.addEventListener('click', () => this.remove())
    document.body.appendChild(this.host)
    this.position(anchorEl)

    // Reposition on scroll/resize
    window.addEventListener('scroll', () => this.position(anchorEl), { passive: true })
    window.addEventListener('resize', () => this.position(anchorEl), { passive: true })
  }

  position(anchorEl: Element): void {
    const rect = anchorEl.getBoundingClientRect()
    this.host.style.cssText = `
      position: fixed;
      z-index: 2147483644;
      pointer-events: all;
      top: ${rect.top - 8}px;
      left: ${rect.right + 8}px;
      max-width: 240px;
    `
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

function showCommentDialog(
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

// ─── Comment mode controller ──────────────────────────────────────────────────

export class CommentMode {
  private bubbles: CommentBubble[] = []
  private lastCommentText: string | null = null

  enable(): void {
    document.addEventListener('click', this.onClick, true)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.body.style.cursor = 'cell'
  }

  disable(): void {
    document.removeEventListener('click', this.onClick, true)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.body.style.cursor = ''
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') {
      document.body.style.cursor = 'copy'
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') {
      document.body.style.cursor = 'cell'
    }
  }

  private placeComment(text: string, selector: string, fiber: { componentName: string | null }, target: Element): void {
    changeTracker.addComment({
      selector,
      componentName: fiber.componentName,
      text,
    })

    const stored = changeTracker.getComments()
    const latest = stored[stored.length - 1]
    this.bubbles = [...this.bubbles, new CommentBubble(latest.id, text, target)]
  }

  private onClick = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return

    e.preventDefault()
    e.stopPropagation()

    const fiber = extractFiberInfo(target)
    const selector = buildSelector(target)

    if (e.shiftKey && this.lastCommentText !== null) {
      this.placeComment(this.lastCommentText, selector, fiber, target)
      return
    }

    const rect = target.getBoundingClientRect()
    const dialogX = Math.min(rect.right + 12, window.innerWidth - 280)
    const dialogY = Math.max(rect.top, 10)

    showCommentDialog(dialogX, dialogY, (text) => {
      this.lastCommentText = text
      this.placeComment(text, selector, fiber, target)
    })
  }

  destroy(): void {
    this.disable()
    this.bubbles.forEach((b) => b.remove())
    this.bubbles = []
    this.lastCommentText = null
  }
}
