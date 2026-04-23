/**
 * Figma-style property panel — right-side panel for editing element styles.
 * CSS: properties-styles.ts | Icons: properties-icons.ts | Sections: properties-sections.ts
 */

import { getLocalFonts } from './fonts.js'
import { buildUniqueSelector } from './selector.js'
import { captureElementInfo } from './element-info.js'
import { changeTracker } from '../changes.js'
import { extractFiberInfo } from '../fiber.js'
import { PANEL_STYLES } from './properties-styles.js'
import { makePanelDraggable } from '../draggable.js'
import { ACCENT, ACCENT_RGB } from '../tokens.js'
import {
  renderPositionSection,
  renderAutoLayoutSection,
  renderAppearanceSection,
  renderFillSection,
  renderStrokeSection,
  renderTextSection,
} from './properties-sections.js'
import {
  bindPositionEvents,
  bindAutoLayoutEvents,
  bindAppearanceEvents,
  bindFillStrokeEvents,
  bindTextEvents,
} from './properties-bind.js'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface StyleEdit {
  property: string
  value: string
}

export type StyleChangeHandler = (edit: StyleEdit, syncComponent: boolean) => void

function cssVar(prop: string): string {
  return prop.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export class PropertiesPanel {
  private host: HTMLElement
  private shadow: ShadowRoot
  private target: Element | null = null
  private syncComponent = false
  private onChangeHandler: StyleChangeHandler | null = null
  private fonts: string[] = []
  private activeTab: 'style' | 'code' = 'style'
  private dragCleanup: (() => void) | null = null
  private resolvedSource: { file: string; line: number } | null = null

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'edit-panel')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `<style>${PANEL_STYLES}</style>`
    this.host.style.display = 'none'
    document.body.appendChild(this.host)
    getLocalFonts().then((f) => { this.fonts = f })
  }

  onStyleChange(handler: StyleChangeHandler): void {
    this.onChangeHandler = handler
  }

  async show(target: Element): Promise<void> {
    this.target = target
    this.resolvedSource = null
    this.syncComponent = false   // reset per-selection; don't bleed across elements
    this.fonts = await getLocalFonts()
    this.host.style.display = ''
    this.render()
    const fiber = extractFiberInfo(target)
    if (!fiber.sourceFile) {
      this.startSourceLookup(target)
    }
  }

  private startSourceLookup(el: Element): void {
    import('../source-locator.js')
      .then(({ resolveComponentSource }) => resolveComponentSource(el))
      .then((loc) => {
        if (!loc || !this.target) return
        this.resolvedSource = { file: loc.file, line: loc.line }
        this.render()
      })
      .catch((err) => { console.warn('[DE props] source lookup failed:', err) })
  }

  hide(): void {
    this.host.style.display = 'none'
    this.target = null
  }

  private render(): void {
    if (!this.target) return
    const el = this.target
    const computed = globalThis.getComputedStyle(el)
    const fiber = extractFiberInfo(el)
    const name = fiber.componentName ?? el.tagName.toLowerCase()

    const fontOptions = this.fonts
      .map((f) => `<option value="${f}" ${computed.fontFamily.includes(f) ? 'selected' : ''}>${f}</option>`)
      .join('')

    const effectiveFile = fiber.sourceFile ?? this.resolvedSource?.file ?? null
    const effectiveLine = fiber.sourceLine ?? this.resolvedSource?.line ?? null
    const sourceLineSuffix = effectiveLine ? `:${effectiveLine}` : ''
    const sourceInfo = effectiveFile ? `${effectiveFile}${sourceLineSuffix}` : null
    const codeTabContent = this.buildCodeTabHtml(sourceInfo, el, fiber)

    this.shadow.innerHTML = `
      <style>${PANEL_STYLES}
      .mode-tabs{display:flex;gap:0;padding:0 12px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:0}
      .mode-tab{flex:1;padding:7px 0;background:transparent;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,0.38);font-size:12px;cursor:pointer;font-family:inherit;transition:all 0.12s}
      .mode-tab.active{color:rgba(255,255,255,0.9);border-bottom-color:${ACCENT}}
      .mode-tab:hover:not(.active){color:rgba(255,255,255,0.6)}
      .code-panel{padding:12px;display:flex;flex-direction:column;gap:8px;min-height:0}
      .code-info{font-size:10px;color:rgba(255,255,255,0.4);word-break:break-all;line-height:1.5}
      .code-actions{display:flex;gap:6px;flex-wrap:wrap}
      .code-btn{padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8);font-size:11px;cursor:pointer;font-family:inherit;transition:background 0.12s}
      .code-btn:hover{background:rgba(255,255,255,0.12)}
      .code-wrap{background:rgba(0,0,0,0.35);border-radius:6px;overflow:auto;max-height:360px;min-height:60px}
      .code-block{padding:10px;font-family:"SF Mono","Menlo",monospace;font-size:10px;color:#e2e8f0;line-height:1.7;white-space:pre}
      .code-line{display:flex;gap:0;padding:1px 0;border-radius:3px}
      .code-prop{color:#79b8ff}
      .code-colon{color:rgba(255,255,255,0.4)}
      .code-val{color:#f8c555}
      .code-semi{color:rgba(255,255,255,0.3)}
      .code-line.hl{background:rgba(${ACCENT_RGB},0.18);border-left:2px solid ${ACCENT};margin-left:-10px;padding-left:8px}
      .code-line.hl .code-prop{color:#a8d8ff}
      </style>
      <div class="panel">
        <div class="panel-header">
          <div class="title">${name}</div>
          <div class="subtitle">&lt;${escapeHtml(el.tagName.toLowerCase())}&gt;${el.id ? ' #' + escapeHtml(el.id) : ''}${el.classList[0] ? ' .' + escapeHtml(el.classList[0]) : ''}</div>
        </div>
        <div class="mode-tabs">
          <button class="mode-tab${this.activeTab === 'style' ? ' active' : ''}" data-tab="style">样式</button>
          <button class="mode-tab${this.activeTab === 'code' ? ' active' : ''}" data-tab="code">代码</button>
        </div>
        <div id="tab-style" style="${this.activeTab !== 'style' ? 'display:none' : ''}">
          ${renderPositionSection(computed)}
          ${renderAutoLayoutSection(computed)}
          ${renderAppearanceSection(computed)}
          ${renderFillSection(computed)}
          ${renderStrokeSection(computed)}
          ${renderTextSection(computed, el, fontOptions)}
          <div class="sync-row">
            <span class="sync-label">同步所有「${name}」实例</span>
            <input type="checkbox" class="toggle" id="de-sync" ${this.syncComponent ? 'checked' : ''} />
          </div>
        </div>
        <div id="tab-code" class="code-panel" style="${this.activeTab !== 'code' ? 'display:none' : ''}">
          ${codeTabContent}
        </div>
      </div>`

    this.bindEvents()
    this.bindTabEvents(fiber)

    this.dragCleanup?.()
    const header = this.shadow.querySelector<HTMLElement>('.panel-header')
    if (header) this.dragCleanup = makePanelDraggable(header, this.host)
  }

  // ── Tab switching ──────────────────────────────────────────

  private bindTabEvents(fiber: ReturnType<typeof extractFiberInfo>): void {
    const sh = this.shadow
    const effectiveFile = fiber.sourceFile ?? this.resolvedSource?.file ?? null
    const effectiveLine = fiber.sourceLine ?? this.resolvedSource?.line ?? 1

    sh.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset['tab'] as 'style' | 'code'
        if (tab === this.activeTab) return
        this.activeTab = tab
        sh.querySelectorAll('.mode-tab').forEach((b) => b.classList.toggle('active', b === btn))
        const stylePanel = sh.getElementById('tab-style')
        const codePanel = sh.getElementById('tab-code')
        if (stylePanel) stylePanel.style.display = tab === 'style' ? '' : 'none'
        if (codePanel) codePanel.style.display = tab === 'code' ? '' : 'none'
      })
    })

    sh.querySelector<HTMLButtonElement>('[data-action="copy-css"]')?.addEventListener('click', () => {
      if (!this.target) return
      const fib = extractFiberInfo(this.target)
      const css = this.generateCssText(this.target, fib)
      navigator.clipboard.writeText(css).then(() => {
        const btn = sh.querySelector<HTMLButtonElement>('[data-action="copy-css"]')
        if (btn) { btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '复制 CSS' }, 1500) }
      })
    })

    sh.querySelector<HTMLButtonElement>('[data-action="open-vscode"]')?.addEventListener('click', () => {
      if (effectiveFile) {
        const a = document.createElement('a')
        a.href = `vscode://file${effectiveFile}:${effectiveLine}`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
    })
  }

  // ── CSS code tab ───────────────────────────────────────────

  private static readonly CSS_PROPS = [
    'display', 'position',
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'top', 'right', 'bottom', 'left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'gap',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'text-align', 'color', 'background-color',
    'border-radius', 'border-width', 'border-style', 'border-color',
    'box-shadow', 'opacity', 'overflow', 'transform', 'visibility', 'cursor',
  ]

  private static readonly SKIP_COMPUTED = new Set([
    'none', 'auto', '0px', 'normal', 'initial', 'inherit', 'unset',
    'rgba(0, 0, 0, 0)', 'static', 'visible', 'nowrap', 'start', 'baseline',
    'inline', '1', 'auto auto',
  ])

  private getChangedProps(): Set<string> {
    const changed = new Set<string>()
    for (const change of changeTracker.getChanges()) {
      if (change.type === 'style' && change.property) {
        changed.add(change.property)
        changed.add(cssVar(change.property))
      }
    }
    return changed
  }

  private isSkippedComputedValue(prop: string, val: string): boolean {
    if (PropertiesPanel.SKIP_COMPUTED.has(val)) return true
    if (prop === 'opacity' && val === '1') return true
    if (prop === 'cursor' && (val === 'auto' || val === 'default')) return true
    if (prop === 'position' && val === 'static') return true
    if (prop === 'display' && val === 'inline') return true
    if (/^(margin|padding)/.test(prop) && val === '0px') return true
    return false
  }

  private buildCssRows(el: Element): Array<{ prop: string; val: string; changed: boolean }> {
    const computed = globalThis.getComputedStyle(el)
    const inlineEl = el as HTMLElement
    const changedProps = this.getChangedProps()
    const rows: Array<{ prop: string; val: string; changed: boolean }> = []
    const seen = new Set<string>()

    // Inline styles first (explicit user overrides)
    for (const prop of inlineEl.style) {
      const val = inlineEl.style.getPropertyValue(prop)
      if (!val) continue
      seen.add(prop)
      rows.push({ prop, val, changed: changedProps.has(prop) })
    }

    // Then non-trivial computed styles
    for (const prop of PropertiesPanel.CSS_PROPS) {
      if (seen.has(prop)) continue
      const val = computed.getPropertyValue(prop)
      if (!val || this.isSkippedComputedValue(prop, val)) continue
      rows.push({ prop, val, changed: false })
    }

    return rows
  }

  private generateCssText(el: Element, fiber: ReturnType<typeof extractFiberInfo>): string {
    const rows = this.buildCssRows(el)
    const name = fiber.componentName ?? el.tagName.toLowerCase()
    const lines = rows.map(({ prop, val }) => `  ${prop}: ${val};`)
    return `/* ${name} */\n{\n${lines.join('\n')}\n}`
  }

  private buildCodeTabHtml(
    sourceInfo: string | null,
    el: Element,
    fiber: ReturnType<typeof extractFiberInfo>,
  ): string {
    const rows = this.buildCssRows(el)
    const compLabel = fiber.componentName ?? el.tagName.toLowerCase()
    const infoText = sourceInfo ?? compLabel
    const disabledAttr = sourceInfo ? '' : 'disabled style="opacity:0.35;cursor:not-allowed"'

    const codeHtml = rows.length === 0
      ? '<div style="color:rgba(255,255,255,0.3);padding:8px 0">（无可展示的样式）</div>'
      : rows.map(({ prop, val, changed }) => {
          const safeVal = val.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          return `<div class="code-line${changed ? ' hl' : ''}">` +
            `<span class="code-prop">${prop}</span>` +
            `<span class="code-colon">: </span>` +
            `<span class="code-val">${safeVal}</span>` +
            `<span class="code-semi">;</span></div>`
        }).join('')

    return `
      <div class="code-info">${infoText}</div>
      <div class="code-actions">
        <button class="code-btn" data-action="copy-css">复制 CSS</button>
        <button class="code-btn" data-action="open-vscode" ${disabledAttr}>在 VS Code 打开</button>
      </div>
      <div class="code-wrap">
        <div class="code-block" id="code-block">${codeHtml}</div>
      </div>`
  }

  // ── Style helpers ──────────────────────────────────────────

  private apply(prop: string, value: string): void {
    const el = this.target as HTMLElement
    const old = el.style.getPropertyValue(cssVar(prop)) ||
                globalThis.getComputedStyle(el).getPropertyValue(cssVar(prop))
    el.style.setProperty(cssVar(prop), value)
    this.recordChange(prop, old, value)
    this.notifyChange({ property: prop, value })
  }

  // ── Event binding ──────────────────────────────────────────

  private bindEvents(): void {
    const el = this.target as HTMLElement
    const sh = this.shadow
    const apply = this.apply.bind(this)
    const render = this.render.bind(this)

    bindPositionEvents(sh, el, apply, render)
    bindAutoLayoutEvents(sh, el, apply, render)
    bindAppearanceEvents(sh, el, apply, render)
    bindFillStrokeEvents(sh, apply, render)
    bindTextEvents(sh, el, apply, render, this.recordChange.bind(this), this.notifyChange.bind(this))

    sh.getElementById('de-sync')?.addEventListener('change', (e) => {
      this.syncComponent = (e.target as HTMLInputElement).checked
    })
  }

  // ── Bookkeeping ────────────────────────────────────────────

  private recordChange(property: string, oldValue: string, newValue: string): void {
    if (!this.target) return
    const fiber = extractFiberInfo(this.target)
    const sel = buildUniqueSelector(this.target)
    const { classList, parentClassList, parentLayoutCtx } = captureElementInfo(this.target)
    changeTracker.addChange({
      type: property === 'textContent' ? 'text' : 'style',
      selector: sel,
      componentName: fiber.componentName,
      sourceFile: fiber.sourceFile,
      sourceLine: fiber.sourceLine,
      property,
      oldValue,
      newValue,
      classList,
      parentClassList,
      parentLayoutCtx,
    })
  }

  private notifyChange(edit: StyleEdit): void {
    this.onChangeHandler?.(edit, this.syncComponent)
  }

  setMultiSelect(count: number): void {
    const title = this.shadow.querySelector('.title')
    if (title) title.textContent = `已选 ${count} 个组件`
  }

  destroy(): void {
    this.host.remove()
  }
}
