/**
 * Figma-style property panel — right-side panel for editing element styles.
 * CSS: properties-styles.ts | Icons: properties-icons.ts | Sections: properties-sections.ts
 */

import { getLocalFonts } from './fonts.js'
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
    const computed = window.getComputedStyle(el)
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
          <div class="subtitle">&lt;${el.tagName.toLowerCase()}&gt;${el.id ? ' #' + el.id : ''}${el.classList[0] ? ' .' + el.classList[0] : ''}</div>
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
                window.getComputedStyle(el).getPropertyValue(cssVar(prop))
    el.style.setProperty(cssVar(prop), value)
    this.recordChange(prop, old, value)
    this.notifyChange({ property: prop, value })
  }

  private bindNum(id: string, prop: string, suffix = 'px'): void {
    this.shadow.getElementById(id)?.addEventListener('change', (e) => {
      this.apply(prop, (e.target as HTMLInputElement).value + suffix)
    })
  }

  private bindColorPair(prefix: string, cssProp: string): void {
    const picker = this.shadow.getElementById(`${prefix}-picker`) as HTMLInputElement | null
    const hexIn  = this.shadow.getElementById(`${prefix}-hex`) as HTMLInputElement | null

    const apply = (hex: string): void => {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
      const bg = this.shadow.querySelector<HTMLDivElement>(`#${prefix}-picker`)
        ?.closest('.cswatch')?.querySelector<HTMLDivElement>('.cswatch-bg')
      if (picker) picker.value = hex
      if (hexIn)  hexIn.value = hex.replace('#', '').toUpperCase()
      if (bg)     bg.style.background = hex
      this.apply(cssProp, hex)
    }

    picker?.addEventListener('input', () => apply(picker.value))
    hexIn?.addEventListener('change', () => apply('#' + hexIn.value))
  }

  // ── Event binding ──────────────────────────────────────────

  private bindEvents(): void {
    const el = this.target as HTMLElement
    const sh = this.shadow

    this.bindPositionEvents(el, sh)
    this.bindAutoLayoutEvents(el, sh)
    this.bindAppearanceEvents(sh)
    this.bindFillStrokeEvents(sh)
    this.bindTextEvents(el, sh)

    sh.getElementById('de-sync')?.addEventListener('change', (e) => {
      this.syncComponent = (e.target as HTMLInputElement).checked
    })

  }

  private bindPositionEvents(el: HTMLElement, sh: ShadowRoot): void {
    // Horizontal alignment via margin
    const hAlignMap: Record<string, () => void> = {
      'al-left':  () => { this.apply('marginLeft', '');     this.apply('marginRight', 'auto') },
      'al-ch':    () => { this.apply('marginLeft', 'auto'); this.apply('marginRight', 'auto') },
      'al-right': () => { this.apply('marginLeft', 'auto'); this.apply('marginRight', '') },
    }
    Object.entries(hAlignMap).forEach(([id, fn]) => {
      sh.getElementById(id)?.addEventListener('click', () => { fn(); this.render() })
    })

    // Vertical alignment via align-self
    const vAlignMap: Record<string, string> = {
      'al-top': 'flex-start', 'al-mid': 'center', 'al-bottom': 'flex-end',
    }
    Object.entries(vAlignMap).forEach(([id, val]) => {
      sh.getElementById(id)?.addEventListener('click', () => { this.apply('alignSelf', val); this.render() })
    })

    this.bindNum('pos-x', 'left')
    this.bindNum('pos-y', 'top')

    sh.getElementById('pos-rot')?.addEventListener('change', (e) => {
      const deg = (e.target as HTMLInputElement).value
      this.apply('transform', `rotate(${deg}deg)`)
    })

    sh.getElementById('btn-fliph')?.addEventListener('click', () => {
      const cur = window.getComputedStyle(el).transform
      this.apply('transform', cur.includes('scaleX(-1)') ? '' : 'scaleX(-1)')
    })
    sh.getElementById('btn-flipv')?.addEventListener('click', () => {
      const cur = window.getComputedStyle(el).transform
      this.apply('transform', cur.includes('scaleY(-1)') ? '' : 'scaleY(-1)')
    })
  }

  private bindAutoLayoutEvents(el: HTMLElement, sh: ShadowRoot): void {
    sh.getElementById('al-toggle')?.addEventListener('click', () => {
      const isFlex = window.getComputedStyle(el).display === 'flex'
      this.apply('display', isFlex ? '' : 'flex')
      this.render()
    })

    const flowMap: Record<string, () => void> = {
      'flow-row':     () => { this.apply('flexDirection', 'row');    this.apply('flexWrap', 'nowrap') },
      'flow-col':     () => { this.apply('flexDirection', 'column'); this.apply('flexWrap', 'nowrap') },
      'flow-rowwrap': () => { this.apply('flexDirection', 'row');    this.apply('flexWrap', 'wrap') },
      'flow-rev': () => {
        const cur = window.getComputedStyle(el).flexDirection
        const rev = cur.includes('reverse') ? cur.replace('-reverse', '') : cur + '-reverse'
        this.apply('flexDirection', rev)
      },
    }
    Object.entries(flowMap).forEach(([id, fn]) => {
      sh.getElementById(id)?.addEventListener('click', () => { fn(); this.render() })
    })

    const applyResize = (axis: 'w' | 'h'): void => {
      const numEl  = sh.getElementById(`resize-${axis}`) as HTMLInputElement | null
      const modeEl = sh.getElementById(`resize-${axis}-mode`) as HTMLSelectElement | null
      if (!numEl || !modeEl) return
      const prop = axis === 'w' ? 'width' : 'height'
      switch (modeEl.value) {
        case 'hug':  this.apply(prop, 'fit-content'); this.apply('flex', '');  break
        case 'fill': this.apply(prop, '100%');        this.apply('flex', '1'); break
        default:     this.apply(prop, numEl.value + 'px'); this.apply('flex', '')
      }
    }
    sh.getElementById('resize-w')?.addEventListener('change', () => applyResize('w'))
    sh.getElementById('resize-h')?.addEventListener('change', () => applyResize('h'))
    sh.getElementById('resize-w-mode')?.addEventListener('change', () => applyResize('w'))
    sh.getElementById('resize-h-mode')?.addEventListener('change', () => applyResize('h'))

    sh.querySelectorAll<HTMLButtonElement>('.agbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.apply('alignItems',    btn.dataset['ai'] ?? 'flex-start')
        this.apply('justifyContent', btn.dataset['jc'] ?? 'flex-start')
        this.render()
      })
    })

    this.bindNum('al-gap', 'gap')
    sh.getElementById('pad-h')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value + 'px'
      this.apply('paddingLeft', v); this.apply('paddingRight', v)
    })
    sh.getElementById('pad-v')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value + 'px'
      this.apply('paddingTop', v); this.apply('paddingBottom', v)
    })
    sh.getElementById('al-clip')?.addEventListener('change', (e) => {
      this.apply('overflow', (e.target as HTMLInputElement).checked ? 'hidden' : 'visible')
    })
  }

  private bindAppearanceEvents(sh: ShadowRoot): void {
    sh.getElementById('ap-opacity')?.addEventListener('change', (e) => {
      const pct = parseFloat((e.target as HTMLInputElement).value)
      this.apply('opacity', String(pct / 100))
    })
    this.bindNum('ap-radius', 'borderRadius')
    sh.getElementById('btn-corner-ind')?.addEventListener('click', () => this.render())
    ;(['ap-tl', 'ap-tr', 'ap-br', 'ap-bl'] as const).forEach((id, i) => {
      const props = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
      this.bindNum(id, props[i] as string)
    })
    sh.getElementById('btn-vis')?.addEventListener('click', () => {
      const el = this.target as HTMLElement
      const cur = window.getComputedStyle(el).visibility
      this.apply('visibility', cur === 'hidden' ? 'visible' : 'hidden')
    })
  }

  private bindFillStrokeEvents(sh: ShadowRoot): void {
    this.bindColorPair('fill', 'backgroundColor')
    sh.getElementById('fill-add')?.addEventListener('click', () => {
      this.apply('backgroundColor', '#ffffff'); this.render()
    })

    this.bindColorPair('stroke', 'borderColor')
    this.bindNum('stroke-w', 'borderWidth')
    sh.getElementById('stroke-style')?.addEventListener('change', (e) => {
      this.apply('borderStyle', (e.target as HTMLSelectElement).value)
    })
    sh.getElementById('stroke-add')?.addEventListener('click', () => {
      this.apply('borderWidth', '1px')
      this.apply('borderStyle', 'solid')
      this.apply('borderColor', '#000000')
      this.render()
    })
  }

  private bindTextEvents(el: HTMLElement, sh: ShadowRoot): void {
    sh.getElementById('txt-font')?.addEventListener('change', (e) => {
      this.apply('fontFamily', (e.target as HTMLSelectElement).value)
    })
    this.bindNum('txt-size', 'fontSize')
    sh.getElementById('txt-weight')?.addEventListener('change', (e) => {
      this.apply('fontWeight', (e.target as HTMLSelectElement).value)
    })
    this.bindNum('txt-lh', 'lineHeight')
    this.bindNum('txt-ls', 'letterSpacing')
    this.bindColorPair('txt-color', 'color')

    sh.querySelectorAll<HTMLButtonElement>('[data-ta]').forEach((b) => {
      b.addEventListener('click', () => {
        this.apply('textAlign', b.dataset['ta'] ?? 'left'); this.render()
      })
    })

    const textarea = sh.getElementById('txt-content') as HTMLTextAreaElement | null
    if (textarea) {
      textarea.addEventListener('change', () => {
        const old = el.textContent?.trim() ?? ''
        el.textContent = textarea.value
        this.recordChange('textContent', old, textarea.value)
        this.notifyChange({ property: 'textContent', value: textarea.value })
      })
    }
  }

  // ── Bookkeeping ────────────────────────────────────────────

  private recordChange(property: string, oldValue: string, newValue: string): void {
    if (!this.target) return
    const fiber = extractFiberInfo(this.target)
    const sel = this.target.id
      ? `#${this.target.id}`
      : `${this.target.tagName.toLowerCase()}${this.target.classList[0] ? '.' + this.target.classList[0] : ''}`
    changeTracker.addChange({
      type: property === 'textContent' ? 'text' : 'style',
      selector: sel,
      componentName: fiber.componentName,
      sourceFile: fiber.sourceFile,
      sourceLine: fiber.sourceLine,
      property,
      oldValue,
      newValue,
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
