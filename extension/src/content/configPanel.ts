/**
 * Config Panel — right-side panel showing change list with tabs and export/submit in header.
 */

import { changeTracker, type Change, type Comment } from './changes.js'
import { wsClient } from './ws.js'
import { requestHistory } from './requestHistory.js'
import { makePanelDraggable } from './draggable.js'
import { ACCENT, ACCENT_HOVER } from './tokens.js'

type Tab = 'all' | 'style' | 'text' | 'comment'

const PANEL_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 56px;
    right: 12px;
    z-index: 2147483645;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
    width: 320px;
    max-height: calc(100vh - 68px);
    display: flex;
    flex-direction: column;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .panel {
    background: rgba(28, 28, 30, 0.88);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
    overflow: visible;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 68px);
    color: rgba(255,255,255,0.9);
    font-size: 11px;
  }
  .cfg-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
    cursor: grab;
  }
  .cfg-header:active { cursor: grabbing; }
  .cfg-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .cfg-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); }
  .cfg-sub { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 3px; }
  .cfg-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  /* Export dropdown */
  .cfg-export-wrap { position: relative; }
  .cfg-btn {
    height: 26px; padding: 0 10px; border-radius: 6px;
    font-family: inherit; font-size: 11px; font-weight: 500; cursor: pointer;
    transition: opacity 0.12s; display: flex; align-items: center; gap: 4px;
  }
  .cfg-btn:hover { opacity: 0.82; }
  .cfg-btn.ghost {
    background: transparent; border: 1.5px solid rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.7);
  }
  .cfg-btn.primary {
    background: ${ACCENT}; border: none; color: white; position: relative;
  }
  .cfg-btn.primary:hover { opacity: 1; background: ${ACCENT_HOVER}; }
  .cfg-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .cfg-count-badge {
    background: rgba(255,255,255,0.25); color: white; font-size: 9px; font-weight: 700;
    padding: 1px 4px; border-radius: 8px; margin-left: 2px; min-width: 14px;
    text-align: center; line-height: 14px;
  }
  .cfg-export-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: rgba(38, 38, 40, 0.96);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    min-width: 150px;
    z-index: 10;
    overflow: hidden;
  }
  .cfg-export-item {
    display: block; width: 100%; padding: 9px 12px; text-align: left;
    background: transparent; border: none; color: rgba(255,255,255,0.8);
    font-size: 11px; font-family: inherit; cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    transition: background 0.1s;
  }
  .cfg-export-item:last-child { border-bottom: none; }
  .cfg-export-item:hover { background: rgba(255,255,255,0.07); }

  .cfg-tabs {
    display: flex; padding: 0 12px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
  }
  .cfg-tab {
    padding: 7px 10px; font-size: 10px; font-weight: 500;
    color: rgba(255,255,255,0.3); border-bottom: 2px solid transparent;
    cursor: pointer; white-space: nowrap; transition: color 0.12s;
    background: transparent; border-top: none; border-left: none; border-right: none;
    font-family: inherit;
  }
  .cfg-tab:hover { color: rgba(255,255,255,0.6); }
  .cfg-tab.active { color: rgba(255,255,255,0.9); border-bottom-color: rgba(255,255,255,0.7); }
  .cfg-list {
    padding: 4px 0;
    overflow-y: auto;
    flex: 1;
  }
  .cfg-list::-webkit-scrollbar { width: 3px; }
  .cfg-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  /* Item layout */
  .cfg-item {
    padding: 9px 12px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 0.1s;
  }
  .cfg-item:last-child { border-bottom: none; }
  .cfg-item:hover { background: rgba(255,255,255,0.025); }
  .cfg-item-header {
    display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
  }
  .cfg-tag {
    font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 3px;
    letter-spacing: 0.03em; flex-shrink: 0;
  }
  .cfg-tag.style   { background: rgba(52,120,246,0.18); color: #6aa3ff; }
  .cfg-tag.text    { background: rgba(52,199,89,0.15);  color: #5dcc72; }
  .cfg-tag.comment { background: rgba(255,149,0,0.15);  color: #ffaa33; }
  .cfg-comp { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cfg-undo-btn {
    height: 20px; padding: 0 7px; border-radius: 4px;
    background: transparent; border: 1px solid rgba(255,255,255,0.1);
    font-family: inherit; font-size: 10px; color: rgba(255,255,255,0.3);
    cursor: pointer; transition: all 0.1s; flex-shrink: 0;
  }
  .cfg-undo-btn:hover { border-color: rgba(255,255,255,0.22); color: rgba(255,255,255,0.6); }
  .cfg-source {
    font-size: 9px; color: rgba(255,255,255,0.25); margin-bottom: 5px;
    font-family: "SF Mono","Menlo",monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cfg-code-block {
    background: rgba(0,0,0,0.32); border-radius: 5px;
    padding: 6px 8px; font-family: "SF Mono","Menlo",monospace;
    font-size: 10px; color: #7dd3fc; word-break: break-all; line-height: 1.5;
  }
  .cfg-text-diff {
    display: flex; flex-direction: column; gap: 3px;
  }
  .cfg-text-old {
    font-size: 10px; color: rgba(255,255,255,0.35); text-decoration: line-through;
    word-break: break-word;
  }
  .cfg-text-new {
    font-size: 10px; color: rgba(255,255,255,0.75); word-break: break-word;
  }
  .cfg-text-arrow { font-size: 10px; color: rgba(255,255,255,0.2); }
  .cfg-comment-text { font-size: 11px; color: rgba(255,255,255,0.7); line-height: 1.5; word-break: break-word; }
  .cfg-comment-meta { font-size: 9px; color: rgba(255,255,255,0.2); margin-top: 3px; }
  .cfg-empty {
    padding: 24px 14px; text-align: center;
    font-size: 11px; color: rgba(255,255,255,0.25);
  }
`

export class ConfigPanel {
  private host: HTMLElement
  private shadow: ShadowRoot
  private activeTab: Tab = 'all'
  private submitState: 'idle' | 'loading' | 'done' | 'error' = 'idle'
  private dropdownOpen = false
  private dragCleanup: (() => void) | null = null

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'config-panel')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `<style>${PANEL_STYLES}</style>`
    this.host.style.display = 'none'
    document.body.appendChild(this.host)
  }

  show(): void {
    this.host.style.display = ''
    this.render()
  }

  hide(): void {
    this.host.style.display = 'none'
    this.dropdownOpen = false
  }

  private render(): void {
    const changes = changeTracker.getChanges()
    const comments = changeTracker.getComments()

    type Item =
      | { type: 'style' | 'text'; item: Change }
      | { type: 'comment'; item: Comment }

    const allItems: Item[] = [
      ...changes.map((item) => ({
        type: (item.type === 'layout' ? 'style' : item.type) as 'style' | 'text',
        item,
      })),
      ...comments.map((item) => ({ type: 'comment' as const, item })),
    ]

    const filtered = this.activeTab === 'all'
      ? allItems
      : allItems.filter((e) => e.type === this.activeTab)

    const total = allItems.length
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: 'all', label: '全部' },
      { id: 'style', label: '样式' },
      { id: 'text', label: '文本' },
      { id: 'comment', label: '评论' },
    ]

    const tabsHtml = tabs.map(({ id, label }) =>
      `<button class="cfg-tab${this.activeTab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`
    ).join('')

    const itemsHtml = filtered.length === 0
      ? `<div class="cfg-empty">暂无${this.activeTab === 'all' ? '变更' : '此类变更'}</div>`
      : filtered.map(({ type, item }) => this.renderItem(type, item)).join('')

    const submitLabel = this.submitState === 'loading' ? '提交中…'
      : this.submitState === 'done' ? '✓ 已提交'
      : this.submitState === 'error' ? '失败，重试？'
      : '提交'

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="cfg-header">
          <div class="cfg-title-row">
            <span class="cfg-title">变更列表</span>
            <div class="cfg-header-actions">
              <div class="cfg-export-wrap">
                <button class="cfg-btn ghost" data-action="toggle-export">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  导出
                  <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="cfg-export-menu" style="display:none">
                  <button class="cfg-export-item" data-action="copy-prompt">复制 AI Prompt</button>
                  <button class="cfg-export-item" data-action="export-json">下载 JSON</button>
                </div>
              </div>
              <button class="cfg-btn primary" data-action="submit" ${this.submitState === 'loading' ? 'disabled' : ''}>
                ${submitLabel}
                <span class="cfg-count-badge">${total}</span>
              </button>
            </div>
          </div>
          <div class="cfg-sub">共 ${total} 项更改</div>
        </div>
        <div class="cfg-tabs">${tabsHtml}</div>
        <div class="cfg-list">${itemsHtml}</div>
      </div>
    `

    this.bindEvents()

    this.dragCleanup?.()
    const header = this.shadow.querySelector<HTMLElement>('.cfg-header')
    if (header) this.dragCleanup = makePanelDraggable(header, this.host)
  }

  private renderItem(type: Tab, item: Change | Comment): string {
    const tagLabel = type === 'style' ? '样式' : type === 'text' ? '文本' : '评论'
    const ch = item as Change
    const comp = this.escapeHtml(item.componentName ?? ch.selector ?? '')
    const src = ch.sourceFile
      ? `${ch.sourceFile.split('/').slice(-2).join('/')}${ch.sourceLine ? ':' + ch.sourceLine : ''}`
      : ''

    const undoBtn = type !== 'comment'
      ? `<button class="cfg-undo-btn" data-action="undo" data-id="${ch.id}">撤销</button>`
      : `<button class="cfg-undo-btn" data-action="del-comment" data-id="${(item as Comment).id}">删除</button>`

    let bodyHtml = ''
    if (type === 'style') {
      bodyHtml = `
        ${src ? `<div class="cfg-source">${src}</div>` : ''}
        <div class="cfg-code-block">${this.escapeHtml(ch.property ?? '')}: ${this.escapeHtml(ch.newValue ?? '')};</div>`
    } else if (type === 'text') {
      bodyHtml = `
        <div class="cfg-text-diff">
          <div class="cfg-text-old">「${this.escapeHtml(ch.oldValue ?? '')}」</div>
          <div class="cfg-text-arrow">↓</div>
          <div class="cfg-text-new">「${this.escapeHtml(ch.newValue ?? '')}」</div>
        </div>`
    } else {
      const c = item as Comment
      const timeStr = new Date(c.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      bodyHtml = `
        <div class="cfg-comment-text">${this.escapeHtml(c.text)}</div>
        <div class="cfg-comment-meta">${timeStr}</div>`
    }

    return `
      <div class="cfg-item">
        <div class="cfg-item-header">
          <span class="cfg-tag ${type}">${tagLabel}</span>
          <span class="cfg-comp">${comp}</span>
          ${undoBtn}
        </div>
        ${bodyHtml}
      </div>`
  }

  private bindEvents(): void {
    const sh = this.shadow

    sh.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.getAttribute('data-tab') as Tab
        this.render()
      })
    })

    sh.querySelectorAll<HTMLButtonElement>('[data-action="undo"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        if (id) { changeTracker.removeChange(id); this.render() }
      })
    })

    sh.querySelectorAll<HTMLButtonElement>('[data-action="del-comment"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        if (id) { changeTracker.removeComment(id); this.render() }
      })
    })

    // Export dropdown toggle with click-outside dismiss
    const exportToggle = sh.querySelector<HTMLButtonElement>('[data-action="toggle-export"]')
    const exportMenu = sh.querySelector<HTMLElement>('.cfg-export-menu')

    exportToggle?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.dropdownOpen = !this.dropdownOpen
      if (exportMenu) exportMenu.style.display = this.dropdownOpen ? 'block' : 'none'
      if (this.dropdownOpen) {
        setTimeout(() => {
          document.addEventListener('click', () => {
            this.dropdownOpen = false
            if (exportMenu) exportMenu.style.display = 'none'
          }, { once: true })
        }, 0)
      }
    })

    sh.querySelector<HTMLButtonElement>('[data-action="copy-prompt"]')?.addEventListener('click', () => {
      const prompt = changeTracker.exportAIPrompt()
      navigator.clipboard.writeText(prompt).then(() => {
        const btn = sh.querySelector<HTMLButtonElement>('[data-action="copy-prompt"]')
        if (btn) { btn.textContent = '✓ 已复制'; setTimeout(() => { btn.textContent = '复制 AI Prompt' }, 1800) }
      })
      this.dropdownOpen = false
      if (exportMenu) exportMenu.style.display = 'none'
    })

    sh.querySelector<HTMLButtonElement>('[data-action="export-json"]')?.addEventListener('click', () => {
      const json = changeTracker.exportJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `design-easily-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      this.dropdownOpen = false
      if (exportMenu) exportMenu.style.display = 'none'
    })

    sh.querySelector<HTMLButtonElement>('[data-action="submit"]')?.addEventListener('click', () => {
      if (this.submitState === 'loading') return
      const prompt = changeTracker.exportAIPrompt()
      this.submitState = 'loading'
      this.render()
      wsClient.send({ type: 'design:request', action: 'develop', userMessage: prompt, element: null })

      let pendingId: string | null = null
      const unsub = wsClient.onMessage((msg) => {
        if (msg.type === 'design:queued') {
          pendingId = msg.id
          requestHistory.add({ id: msg.id, action: 'develop', userMessage: prompt, status: 'pending' })
          return
        }
        if (pendingId === null || msg.type === 'design:processing') return
        if ((msg.type === 'design:done' || msg.type === 'design:failed') && msg.id === pendingId) {
          this.submitState = msg.type === 'design:done' ? 'done' : 'error'
          if (msg.type === 'design:done') {
            requestHistory.update(msg.id, { status: 'completed', summary: msg.summary, changedFiles: msg.changedFiles })
          } else {
            requestHistory.update(msg.id, { status: 'failed', error: msg.error })
          }
          this.render()
          setTimeout(() => { this.submitState = 'idle'; this.render() }, 2500)
          unsub()
        }
      })
    })
  }

  private escapeHtml(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  destroy(): void {
    this.host.remove()
  }
}
