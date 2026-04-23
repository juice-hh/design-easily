/**
 * InspectPanel — Shadow DOM panel with a state machine:
 *   inspect → running → success | no-changes | error
 */

import { getDegradedInfo } from './fiber.js'
import { wsClient } from './ws.js'
import { requestHistory } from './requestHistory.js'
import { makePanelDraggable } from './draggable.js'
import { openInVSCode } from './inspect-vscode.js'
import type { ElementContext } from './inspect-highlight.js'
import { PANEL_STYLES } from './inspect-panel-styles.js'
import {
  escapeHtmlStr, colorToHexStr, buildPropRows,
  buildStyleEntries, buildFontEntries,
  runningViewHtml, successViewHtml, noChangesViewHtml, errorViewHtml,
} from './inspect-panel-views.js'

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
  private errorTimer: ReturnType<typeof setTimeout> | null = null
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

  private buildPathHtml(shortFile: string | null, sourceLine: number | null, tag: string, classList: string[]): string {
    if (shortFile) {
      return `<div class="ip-path" data-action="open-vscode" title="在 VS Code 中打开">${escapeHtmlStr(shortFile)}:${escapeHtmlStr(String(sourceLine))}</div>`
    }
    if (this.sourceLookupPending) {
      return `<div class="ip-path" style="cursor:default;color:rgba(255,255,255,0.3)">⏳ 定位中…</div>`
    }
    const deg = this.anchorEl ? getDegradedInfo(this.anchorEl) : null
    const domPath = deg?.domPath ?? `${tag}${classList[0] ? '.' + classList[0] : ''}`
    const testId = deg?.dataTestId ? ` · testid:${escapeHtmlStr(deg.dataTestId)}` : ''
    return `<div class="ip-path" style="cursor:default;color:rgba(255,255,255,0.25);margin-top:2px">${escapeHtmlStr(domPath)}${testId}</div>`
  }


  private renderInspect(): void {
    const ctx = this.ctx!
    const { fiber, tag, classList, computedStyles, rect } = ctx

    const componentName = fiber.componentName ?? tag
    const sourceFile = fiber.sourceFile ?? this.resolvedSource?.file ?? null
    const sourceLine = fiber.sourceLine ?? this.resolvedSource?.line ?? null
    const shortFile = sourceFile ? sourceFile.split('/').slice(-2).join('/') : null
    const badgeLabel = fiber.componentName ? tag : tag.toUpperCase()

    const pathHtml = this.buildPathHtml(shortFile, sourceLine, tag, classList)
    const styleEntries = buildStyleEntries(computedStyles)
    const fontEntries = buildFontEntries(computedStyles)
    const renderProps = buildPropRows

    const dimProps = [
      { k: '宽', v: `${Math.round(rect.width)}` }, { k: '高', v: `${Math.round(rect.height)}` },
      { k: 'X', v: `${Math.round(rect.left)}` }, { k: 'Y', v: `${Math.round(rect.top)}` },
    ]

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <div class="panel">
        <div class="ip-header">
          <div class="ip-badge">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/></svg>
            ${badgeLabel}
          </div>
          <div class="ip-name">${escapeHtmlStr(componentName)}</div>
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
    this.shadow.innerHTML = runningViewHtml(snap.elementLabel, snap.userMessage, this.runningStatus, PANEL_STYLES)
    this.shadow.querySelector<HTMLButtonElement>('[data-action="task-cancel"]')
      ?.addEventListener('click', () => {
        if (this.taskId) { wsClient.send({ type: 'design:cancel', id: this.taskId }); this.taskId = null }
        this.state = 'inspect'; this.runningStatus = 'analyzing'; this.taskSnapshot = null
        this.renderPanel()
      })
  }

  // ── success state ─────────────────────────────────────────────────────────────

  private renderSuccess(): void {
    const snap = this.taskSnapshot!
    const result = this.taskResult!
    this.shadow.innerHTML = successViewHtml(snap.elementLabel, snap.userMessage, result.summary, result.changedFiles, PANEL_STYLES)

    this.shadow.querySelectorAll<HTMLElement>('[data-file]').forEach((el) => {
      el.addEventListener('click', () => { const f = el.dataset['file']; if (f) openInVSCode(f, 1) })
    })
    this.shadow.querySelector<HTMLButtonElement>('[data-action="resume-inspect"]')
      ?.addEventListener('click', () => {
        this.state = 'inspect'; this.taskSnapshot = null; this.taskResult = null; this.notifyTaskEnd()
        if (this.ctx && this.anchorEl) { this.renderPanel() } else { this.hide() }
      })
  }

  // ── no-changes state ─────────────────────────────────────────────────────────

  private renderNoChanges(): void {
    const snap = this.taskSnapshot!
    const result = this.taskResult!
    this.shadow.innerHTML = noChangesViewHtml(snap.elementLabel, snap.userMessage, result.summary, PANEL_STYLES)
    this.shadow.querySelector<HTMLButtonElement>('[data-action="resume-inspect"]')
      ?.addEventListener('click', () => {
        this.state = 'inspect'; this.taskSnapshot = null; this.taskResult = null; this.notifyTaskEnd()
        if (this.ctx && this.anchorEl) { this.renderPanel() } else { this.hide() }
      })
  }

  // ── error state ───────────────────────────────────────────────────────────────

  private renderError(): void {
    const snap = this.taskSnapshot
    this.shadow.innerHTML = errorViewHtml(snap?.elementLabel ?? null, snap?.userMessage ?? null, this.taskError ?? '未知错误', !!snap, PANEL_STYLES)
    this.shadow.querySelector<HTMLButtonElement>('[data-action="resume-inspect"]')
      ?.addEventListener('click', () => {
        this.state = 'inspect'; this.taskSnapshot = null; this.taskError = null; this.notifyTaskEnd()
        if (this.ctx && this.anchorEl) { this.renderPanel() } else { this.hide() }
      })
    this.shadow.querySelector<HTMLButtonElement>('[data-action="retry"]')
      ?.addEventListener('click', () => {
        if (!snap) return
        this.state = 'inspect'; this.taskError = null
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

  private showInlineError(msg: string): void {
    if (this.errorTimer) clearTimeout(this.errorTimer)
    const input = this.shadow.querySelector('.ip-chat-input')
    if (!input) return
    let err = this.shadow.querySelector<HTMLElement>('.ip-connect-err')
    if (!err) {
      err = document.createElement('div')
      err.className = 'ip-connect-err'
      input.insertBefore(err, input.firstChild)
    }
    err.textContent = msg
    this.errorTimer = setTimeout(() => { err?.remove(); this.errorTimer = null }, 4000)
  }

  private triggerDevelop(): void {
    const textarea = this.shadow.querySelector<HTMLTextAreaElement>('.ip-textarea')
    const text = textarea?.value.trim()
    if (!text || !this.ctx) return

    if (!wsClient.isConnected()) {
      this.showInlineError('服务器未连接，请先运行 npm run dev')
      return
    }

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

  destroy(): void {
    this.wsUnsubscribe?.()
    if (this.errorTimer) clearTimeout(this.errorTimer)
    this.host.remove()
  }
}
