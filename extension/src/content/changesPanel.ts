/**
 * Bottom changes panel — lists all recorded changes and comments.
 * Supports filter, locate, reset per item, and bulk export.
 * Apple frosted glass style, anchored to the bottom of the viewport.
 */

import { changeTracker, type Change, type Comment } from './changes.js'
import { requestHistory, type DesignEntry } from './requestHistory.js'

type Filter = 'all' | 'style' | 'text' | 'comment' | 'config'

const PANEL_STYLES = `
  :host {
    all: initial;
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483645;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
    width: min(760px, calc(100vw - 32px));
  }
  .panel {
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 16px;
    box-shadow: 0 -4px 32px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.1);
    overflow: hidden;
  }
  .panel-bar {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(0,0,0,0.07);
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: #1c1c1e;
    flex: 1;
  }
  .count-badge {
    background: rgba(0,122,255,0.12);
    color: #007AFF;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 20px;
  }
  .filter-tabs {
    display: flex;
    gap: 3px;
  }
  .filter-tab {
    font-size: 11px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: rgba(0,0,0,0.45);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .filter-tab.active {
    background: rgba(0,122,255,0.1);
    color: #007AFF;
  }
  .export-btns {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
  }
  .btn {
    font-size: 11px;
    font-weight: 600;
    padding: 5px 11px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.8; }
  .btn-primary { background: #007AFF; color: white; }
  .btn-ghost { background: rgba(0,0,0,0.07); color: #1c1c1e; }
  .list {
    max-height: 220px;
    overflow-y: auto;
  }
  .item {
    display: flex;
    align-items: center;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    gap: 8px;
  }
  .item:last-child { border-bottom: none; }
  .item:hover { background: rgba(0,0,0,0.02); }
  .item-type {
    width: 36px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 2px 5px;
    border-radius: 4px;
    text-align: center;
    flex-shrink: 0;
  }
  .item-type.style { background: rgba(0,122,255,0.1); color: #007AFF; }
  .item-type.text { background: rgba(52,199,89,0.1); color: #1d8a3a; }
  .item-type.comment { background: rgba(255,149,0,0.1); color: #b86a00; }
  .item-body {
    flex: 1;
    min-width: 0;
  }
  .item-target {
    font-size: 12px;
    font-weight: 500;
    color: #1c1c1e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-detail {
    font-size: 11px;
    color: rgba(0,0,0,0.45);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "SF Mono", "Menlo", monospace;
    margin-top: 1px;
  }
  .item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .item-btn {
    font-size: 10px;
    padding: 3px 7px;
    border-radius: 5px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-weight: 500;
    transition: opacity 0.15s;
  }
  .item-btn:hover { opacity: 0.7; }
  .locate-btn { background: rgba(0,122,255,0.1); color: #007AFF; }
  .reset-btn { background: rgba(255,59,48,0.1); color: #FF3B30; }
  .empty {
    padding: 20px;
    text-align: center;
    font-size: 12px;
    color: rgba(0,0,0,0.3);
  }
  .chevron {
    font-size: 12px;
    color: rgba(0,0,0,0.35);
    transition: transform 0.2s;
  }
  .chevron.collapsed { transform: rotate(-90deg); }
  .pending-badge {
    background: #007AFF;
    color: white;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    line-height: 1.4;
  }
  .btn-secondary {
    background: transparent;
    color: rgba(0,0,0,0.35);
  }
  .badge-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    padding-top: 1px;
  }
  .entry-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    text-align: center;
  }
  .copy-btn {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 5px;
    font-family: inherit;
    flex-shrink: 0;
    margin-top: 2px;
    transition: opacity 0.15s;
  }
  .copy-btn:hover:not(:disabled) { opacity: 0.7; }
`

export class ChangesPanel {
  private host: HTMLElement
  private shadow: ShadowRoot
  private filter: Filter = 'all'
  private expanded = true
  private unsubscribe: (() => void) | null = null
  private unsubscribeHistory: (() => void) | null = null

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'changes-panel')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    document.body.appendChild(this.host)

    this.unsubscribe = changeTracker.onChange(() => this.render())
    this.unsubscribeHistory = requestHistory.onChange(() => this.render())
    this.render()
  }

  private render(): void {
    const changes = changeTracker.getChanges()
    const comments = changeTracker.getComments()
    const total = changes.length + comments.length

    const filtered = this.filter !== 'config' ? this.buildFiltered(changes, comments) : []

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="panel-bar" data-action="toggle">
          <span class="panel-title">变更列表</span>
          ${total > 0 ? `<span class="count-badge">${total}</span>` : ''}
          <div class="filter-tabs">
            ${(['all', 'style', 'text', 'comment'] as const).map((f) => `
              <button class="filter-tab${this.filter === f ? ' active' : ''}" data-filter="${f}">
                ${{ all: '全部', style: '样式', text: '文本', comment: '评论' }[f]}
              </button>
            `).join('')}
            <button class="filter-tab${this.filter === 'config' ? ' active' : ''}" data-filter="config" style="display:flex;align-items:center;gap:4px;">
              配置${requestHistory.pendingCount() > 0 ? `<span class="pending-badge">${requestHistory.pendingCount()}</span>` : ''}
            </button>
          </div>
          <div class="export-btns">
            <button class="btn btn-secondary" data-action="import">导入</button>
            <button class="btn btn-secondary" data-action="export-json">导出</button>
            <button class="btn btn-secondary" data-action="copy-prompt">Prompt</button>
          </div>
          <span class="chevron${this.expanded ? '' : ' collapsed'}">▾</span>
        </div>
        ${this.expanded ? `
          <div class="list">
            ${this.filter === 'config'
              ? this.renderConfigList()
              : (filtered.length === 0
                  ? `<div class="empty">${total === 0 ? '暂无变更' : '当前筛选无结果'}</div>`
                  : filtered.map((item) => this.renderItem(item)).join('')
                )
            }
          </div>
        ` : ''}
      </div>
    `

    this.bindEvents()
  }

  private buildFiltered(
    changes: Change[],
    comments: Comment[],
  ): Array<{ kind: 'change'; data: Change } | { kind: 'comment'; data: Comment }> {
    const result: Array<{ kind: 'change'; data: Change } | { kind: 'comment'; data: Comment }> = []

    if (this.filter === 'all' || this.filter === 'style' || this.filter === 'text') {
      changes
        .filter((c) => this.filter === 'all' || c.type === this.filter)
        .forEach((c) => result.push({ kind: 'change', data: c }))
    }
    if (this.filter === 'all' || this.filter === 'comment') {
      comments.forEach((c) => result.push({ kind: 'comment', data: c }))
    }

    return result.sort((a, b) => {
      const ta = a.kind === 'change' ? a.data.timestamp : a.data.timestamp
      const tb = b.kind === 'change' ? b.data.timestamp : b.data.timestamp
      return tb - ta
    })
  }

  private renderItem(
    item: { kind: 'change'; data: Change } | { kind: 'comment'; data: Comment },
  ): string {
    if (item.kind === 'change') {
      const c = item.data
      const target = c.componentName ?? c.selector
      const detail = c.type === 'style'
        ? `${c.property}: ${c.oldValue} → ${c.newValue}`
        : `"${c.oldValue}" → "${c.newValue}"`
      return `
        <div class="item" data-id="${c.id}" data-kind="change">
          <span class="item-type ${c.type}">${c.type === 'style' ? '样式' : '文本'}</span>
          <div class="item-body">
            <div class="item-target">${target}</div>
            <div class="item-detail">${detail}</div>
          </div>
          <div class="item-actions">
            <button class="item-btn locate-btn" data-action="locate" data-sel="${c.selector}">定位</button>
            <button class="item-btn reset-btn" data-action="reset" data-id="${c.id}" data-kind="change">重置</button>
          </div>
        </div>
      `
    } else {
      const c = item.data
      return `
        <div class="item" data-id="${c.id}" data-kind="comment">
          <span class="item-type comment">评论</span>
          <div class="item-body">
            <div class="item-target">${c.componentName ?? c.selector}</div>
            <div class="item-detail">${c.text}</div>
          </div>
          <div class="item-actions">
            <button class="item-btn locate-btn" data-action="locate" data-sel="${c.selector}">定位</button>
            <button class="item-btn reset-btn" data-action="reset" data-id="${c.id}" data-kind="comment">删除</button>
          </div>
        </div>
      `
    }
  }

  private renderConfigList(): string {
    const entries = requestHistory.getAll()
    if (entries.length === 0) {
      return `<div class="empty">暂无 MCP 请求记录</div>`
    }
    return entries
      .slice()
      .reverse()
      .map((entry) => this.renderDesignEntry(entry))
      .join('')
  }

  private renderDesignEntry(entry: DesignEntry): string {
    const isSuggest = entry.action === 'suggest'
    const typeBadgeStyle = isSuggest
      ? 'background:rgba(88,86,214,0.1);color:#5856D6'
      : 'background:rgba(52,199,89,0.1);color:#1d8a3a'
    const typeLabel = isSuggest ? '建议' : '开发'

    let statusStyle: string
    let statusLabel: string
    switch (entry.status) {
      case 'pending':
        statusStyle = 'background:rgba(255,149,0,0.1);color:#b86a00'
        statusLabel = '等待中'
        break
      case 'processing':
        statusStyle = 'background:rgba(255,149,0,0.1);color:#b86a00'
        statusLabel = '处理中'
        break
      case 'completed':
        statusStyle = isSuggest
          ? 'background:rgba(88,86,214,0.08);color:#5856D6'
          : 'background:rgba(52,199,89,0.08);color:#1d8a3a'
        statusLabel = '已完成'
        break
      case 'failed':
        statusStyle = 'background:rgba(255,59,48,0.1);color:#FF3B30'
        statusLabel = '失败'
        break
    }

    let summaryHtml: string
    switch (entry.status) {
      case 'pending':
        summaryHtml = `<div class="item-detail" style="color:rgba(255,149,0,0.6);">等待 Claude Code...</div>`
        break
      case 'processing':
        summaryHtml = `<div class="item-detail" style="color:rgba(255,149,0,0.6);">Claude Code 处理中...</div>`
        break
      case 'completed': {
        const text = entry.action === 'suggest'
          ? (entry.content ?? '')
          : (entry.changedFiles?.join(', ') || (entry.summary ?? ''))
        summaryHtml = `<div class="item-detail">${this.escapeHtml(text)}</div>`
        break
      }
      case 'failed':
        summaryHtml = `<div class="item-detail" style="color:rgba(255,59,48,0.55);">${this.escapeHtml(entry.error ?? '')}</div>`
        break
    }

    const copyEnabled = entry.status === 'completed'
    const copyStyle = copyEnabled
      ? 'border:1px solid rgba(0,0,0,0.1);background:transparent;color:rgba(0,0,0,0.3);cursor:pointer;'
      : 'border:1px solid rgba(0,0,0,0.07);background:transparent;color:rgba(0,0,0,0.18);cursor:not-allowed;opacity:0.4;'

    return `
      <div class="item" data-id="${entry.id}" data-kind="design">
        <div class="badge-col">
          <span class="entry-badge" style="${typeBadgeStyle}">${typeLabel}</span>
          <span class="entry-badge" style="${statusStyle}">${statusLabel}</span>
        </div>
        <div class="item-body">
          <div class="item-target">${this.escapeHtml(entry.userMessage)}</div>
          ${summaryHtml}
        </div>
        <button class="copy-btn" style="${copyStyle}" data-action="copy-entry" data-id="${entry.id}"${copyEnabled ? '' : ' disabled'}>复制</button>
      </div>
    `
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private bindEvents(): void {
    // Toggle expand
    this.shadow.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
      const target = e.target as Element
      // Don't toggle if clicking a button/filter inside the bar
      if (target.closest('button')) return
      this.expanded = !this.expanded
      this.render()
    })

    // Filter tabs
    this.shadow.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.filter = btn.getAttribute('data-filter') as Filter
        this.render()
      })
    })

    // Export buttons
    this.shadow.querySelector('[data-action="copy-prompt"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      const prompt = changeTracker.exportAIPrompt()
      navigator.clipboard.writeText(prompt).then(() => this.showToast('AI Prompt 已复制'))
    })

    this.shadow.querySelector('[data-action="export-json"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.downloadJSON()
    })

    this.shadow.querySelector('[data-action="import"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.importJSON()
    })

    // Item actions
    this.shadow.querySelectorAll('[data-action="locate"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const sel = btn.getAttribute('data-sel')!
        const el = document.querySelector(sel)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Flash highlight
          const orig = (el as HTMLElement).style.outline
          ;(el as HTMLElement).style.outline = '3px solid #007AFF'
          setTimeout(() => { (el as HTMLElement).style.outline = orig }, 1500)
        }
      })
    })

    this.shadow.querySelectorAll('[data-action="reset"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')!
        const kind = btn.getAttribute('data-kind')!
        if (kind === 'change') changeTracker.removeChange(id)
        else changeTracker.removeComment(id)
      })
    })

    // Copy design entry result (config tab only)
    this.shadow.querySelectorAll('[data-action="copy-entry"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')!
        const entry = requestHistory.getAll().find((en) => en.id === id)
        if (!entry || entry.status !== 'completed') return
        const text = entry.action === 'suggest'
          ? (entry.content ?? '')
          : (entry.changedFiles && entry.changedFiles.length > 0
              ? entry.changedFiles.join('\n')
              : (entry.summary ?? ''))
        navigator.clipboard.writeText(text).then(() => this.showToast('已复制'))
      })
    })
  }

  private downloadJSON(): void {
    const json = changeTracker.exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `design-easily-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  private importJSON(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          changeTracker.importJSON(reader.result as string)
          this.showToast('JSON 已导入，变更已恢复')
        } catch {
          this.showToast('导入失败：JSON 格式错误')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  private showToast(text: string): void {
    const existing = this.shadow.querySelector('.de-toast')
    existing?.remove()
    const toast = document.createElement('div')
    toast.className = 'de-toast'
    Object.assign(toast.style, {
      position: 'absolute',
      bottom: '70px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(30,30,32,0.85)',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: '500',
      whiteSpace: 'nowrap',
      zIndex: '9999',
    })
    toast.textContent = text
    this.shadow.appendChild(toast)
    setTimeout(() => toast.remove(), 2500)
  }

  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribeHistory?.()
    this.host.remove()
  }
}
