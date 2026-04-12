/** Figma-style section HTML builders — imported by PropertiesPanel */

import { ICO } from './properties-icons.js'

// ── Tiny helpers ─────────────────────────────────────────────

function ico(name: string): string { return ICO[name] ?? '' }

function ibtn(icon: string, id: string, opts: { title?: string; active?: boolean; cls?: string } = {}): string {
  const active = opts.active ? ' active' : ''
  const cls = opts.cls ? ' ' + opts.cls : ''
  return `<button class="ibtn${active}${cls}" id="${id}" title="${opts.title ?? ''}">${ico(icon)}</button>`
}

function sbtn(icon: string, id: string, active: boolean, title = ''): string {
  return `<button class="sbtn${active ? ' active' : ''}" id="${id}" title="${title}">${ico(icon)}</button>`
}

function field(pre: string, inputHtml: string, suf = ''): string {
  const sufHtml = suf ? `<span class="field-suf">${suf}</span>` : ''
  return `<div class="field"><span class="field-pre">${pre}</span>${inputHtml}${sufHtml}</div>`
}

function numInput(id: string, value: string, min = '', step = '1'): string {
  const minAttr = min !== '' ? ` min="${min}"` : ''
  return `<input type="number" id="${id}" value="${value}"${minAttr} step="${step}" />`
}

export function pxVal(val: string): string {
  return String(Math.round(parseFloat(val) || 0))
}

export function opacityPct(val: string): string {
  return String(Math.round((parseFloat(val) || 1) * 100))
}

export function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+/g)
  if (!m) return '#000000'
  return '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')
}

// ── Section builders ─────────────────────────────────────────

export function renderRulerToggle(rulerOn: boolean): string {
  return `
    <div class="section" style="padding:7px 12px">
      <div class="row" style="justify-content:space-between">
        <span class="sec-title" style="font-weight:500;color:#8c8c8c;font-size:10px">标尺</span>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <span style="font-size:10px;color:#8c8c8c">${rulerOn ? '开启' : '关闭'}</span>
          <input type="checkbox" class="toggle" id="ruler-toggle" ${rulerOn ? 'checked' : ''} />
        </label>
      </div>
    </div>`
}

export function renderPositionSection(computed: CSSStyleDeclaration): string {
  const posType = computed.position
  const isAbsOrFixed = posType === 'absolute' || posType === 'fixed'
  const alignSelf = computed.alignSelf
  const ml = computed.marginLeft; const mr = computed.marginRight

  const isAlignTop    = alignSelf === 'flex-start'
  const isAlignMiddle = alignSelf === 'center'
  const isAlignBottom = alignSelf === 'flex-end'
  const isAlignLeft   = mr === 'auto' && ml !== 'auto'
  const isAlignCH     = ml === 'auto' && mr === 'auto'
  const isAlignRight  = ml === 'auto' && mr !== 'auto'

  const rot = (() => {
    if (!computed.transform || computed.transform === 'none') return '0'
    const m = computed.transform.match(/matrix\(([^)]+)\)/)
    if (!m) return '0'
    const parts = m[1].split(',').map(Number)
    const a = parts[0] ?? 1; const b = parts[1] ?? 0
    return String(Math.round(Math.atan2(b, a) * (180 / Math.PI)))
  })()

  return `
    <div class="section">
      <div class="sec-hd"><span class="sec-title">位置</span></div>
      <span class="flabel">对齐</span>
      <div class="row mt4">
        <div class="seg">
          ${sbtn('alignLeft',    'al-left',  isAlignLeft,   '左对齐')}
          ${sbtn('alignCenterH', 'al-ch',    isAlignCH,     '水平居中')}
          ${sbtn('alignRight',   'al-right', isAlignRight,  '右对齐')}
        </div>
        <div class="seg">
          ${sbtn('alignTop',     'al-top',    isAlignTop,    '顶对齐')}
          ${sbtn('alignMiddleV', 'al-mid',    isAlignMiddle, '垂直居中')}
          ${sbtn('alignBottom',  'al-bottom', isAlignBottom, '底对齐')}
        </div>
      </div>
      ${isAbsOrFixed ? `
      <span class="flabel mt6">坐标</span>
      <div class="row mt4">
        ${field('X', numInput('pos-x', pxVal(computed.left)))}
        ${field('Y', numInput('pos-y', pxVal(computed.top)))}
      </div>` : ''}
      <span class="flabel mt6">旋转</span>
      <div class="row mt4">
        ${field(ico('rotate'), numInput('pos-rot', rot), '°')}
        ${ibtn('flipH', 'btn-fliph', { title: '水平翻转' })}
        ${ibtn('flipV', 'btn-flipv', { title: '垂直翻转' })}
      </div>
    </div>`
}

function getAlignGridActive(jc: string, ai: string): string {
  const col = { 'flex-start': 0, normal: 0, start: 0, center: 1, 'flex-end': 2, end: 2 }[jc] ?? 0
  const row = { 'flex-start': 0, normal: 0, start: 0, center: 1, 'flex-end': 2, end: 2 }[ai] ?? 0
  return `${row}-${col}`
}

export function renderAutoLayoutSection(computed: CSSStyleDeclaration): string {
  const isFlex = computed.display === 'flex' || computed.display === 'inline-flex'
  const dir = computed.flexDirection || 'row'
  const wrap = computed.flexWrap || 'nowrap'

  const isRow     = dir === 'row' && wrap !== 'wrap'
  const isCol     = dir === 'column'
  const isRowWrap = dir === 'row' && wrap === 'wrap'
  const isGrid    = computed.display === 'grid'

  const w = computed.width; const h = computed.height
  const wMode = w.includes('fit-content') ? 'hug' : computed.flexGrow === '1' ? 'fill' : 'fixed'
  const hMode = h.includes('fit-content') ? 'hug' : computed.flexGrow === '1' ? 'fill' : 'fixed'

  const gap  = pxVal(computed.gap || computed.columnGap || '0')
  const pl   = pxVal(computed.paddingLeft)
  const pt   = pxVal(computed.paddingTop)
  const clip = computed.overflow === 'hidden' || computed.overflow === 'clip'

  const jc = computed.justifyContent || 'flex-start'
  const ai = computed.alignItems || 'flex-start'
  const activeGrid = getAlignGridActive(jc, ai)

  const gridCells = [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => {
      const active = activeGrid === `${r}-${c}`
      const aiVal = ['flex-start', 'center', 'flex-end'][r] ?? 'flex-start'
      const jcVal = ['flex-start', 'center', 'flex-end'][c] ?? 'flex-start'
      return `<button class="agbtn${active ? ' active' : ''}" data-ai="${aiVal}" data-jc="${jcVal}"><div class="agdot"></div></button>`
    })
  ).join('')

  return `
    <div class="section">
      <div class="sec-hd">
        <span class="sec-title">自动布局</span>
        <button class="al-badge ${isFlex ? 'on' : 'off'}" id="al-toggle">
          ${ico('flowRow')}${isFlex ? '已启用' : '启用'}
        </button>
      </div>
      ${isFlex ? `
      <span class="flabel">方向</span>
      <div class="row mt4">
        <div class="seg">
          ${sbtn('flowRow',     'flow-row',     isRow,     '横向')}
          ${sbtn('flowCol',     'flow-col',     isCol,     '纵向')}
          ${sbtn('flowRowWrap', 'flow-rowwrap', isRowWrap, '横向换行')}
          ${sbtn('flowGrid',    'flow-grid',    isGrid,    '网格')}
        </div>
        ${ibtn('flowReverse', 'flow-rev', { title: '反向' })}
      </div>
      <span class="flabel mt6">尺寸</span>
      <div class="row mt4">
        ${field('W', numInput('resize-w', pxVal(w), '0'))}
        <select class="msel" id="resize-w-mode" style="width:60px">
          <option value="fixed" ${wMode === 'fixed' ? 'selected' : ''}>固定</option>
          <option value="hug"   ${wMode === 'hug'   ? 'selected' : ''}>包裹</option>
          <option value="fill"  ${wMode === 'fill'  ? 'selected' : ''}>填满</option>
        </select>
      </div>
      <div class="row mt4">
        ${field('H', numInput('resize-h', pxVal(h), '0'))}
        <select class="msel" id="resize-h-mode" style="width:60px">
          <option value="fixed" ${hMode === 'fixed' ? 'selected' : ''}>固定</option>
          <option value="hug"   ${hMode === 'hug'   ? 'selected' : ''}>包裹</option>
          <option value="fill"  ${hMode === 'fill'  ? 'selected' : ''}>填满</option>
        </select>
      </div>
      <span class="flabel mt6">对齐 &amp; Gap</span>
      <div class="row mt4" style="align-items:flex-start">
        <div class="algrid">${gridCells}</div>
        <div class="divider-v" style="margin:3px 2px 0"></div>
        <div class="gap-block">
          ${field(ico('gapH'), numInput('al-gap', gap, '0'))}
        </div>
      </div>
      <span class="flabel mt6">Padding</span>
      <div class="row mt4">
        ${field(ico('paddingH'), numInput('pad-h', pl, '0'), 'px')}
        ${field(ico('paddingV'), numInput('pad-v', pt, '0'), 'px')}
        ${ibtn('paddingInd', 'btn-pad-ind', { title: '独立设置' })}
      </div>
      <label class="cbrow mt6">
        <input type="checkbox" id="al-clip" ${clip ? 'checked' : ''} />
        <span class="cblabel">裁剪内容</span>
      </label>` : ''}
    </div>`
}

export function renderAppearanceSection(computed: CSSStyleDeclaration): string {
  const opacity = opacityPct(computed.opacity)
  const tl = pxVal(computed.borderTopLeftRadius)
  const tr = pxVal(computed.borderTopRightRadius)
  const br = pxVal(computed.borderBottomRightRadius)
  const bl = pxVal(computed.borderBottomLeftRadius)
  const allSame = tl === tr && tr === br && br === bl

  return `
    <div class="section">
      <div class="sec-hd">
        <span class="sec-title">外观</span>
        <div class="sec-actions">
          ${ibtn('eye', 'btn-vis', { title: '显示/隐藏' })}
          ${ibtn('opacity', 'btn-blend', { title: '混合模式' })}
        </div>
      </div>
      <div class="row">
        ${field(ico('opacity'), numInput('ap-opacity', opacity, '0', '1'), '%')}
        <span style="width:8px;flex-shrink:0"></span>
        ${field(ico('cornerAll'), numInput('ap-radius', allSame ? tl : tl, '0'))}
        ${ibtn('cornerInd', 'btn-corner-ind', { title: '独立圆角' })}
      </div>
      ${!allSame ? `
      <div class="row mt4">
        ${field('TL', numInput('ap-tl', tl, '0'))}
        ${field('TR', numInput('ap-tr', tr, '0'))}
        ${field('BR', numInput('ap-br', br, '0'))}
        ${field('BL', numInput('ap-bl', bl, '0'))}
      </div>` : ''}
    </div>`
}

function colorSwatchField(prefix: string, hex: string): string {
  return `
    <div class="row">
      <div class="cswatch">
        <div class="cswatch-bg" style="background:${hex}"></div>
        <input type="color" id="${prefix}-picker" value="${hex}" />
      </div>
      ${field('', `<input type="text" id="${prefix}-hex" value="${hex.replace('#', '')}" maxlength="6" style="text-align:left;text-transform:uppercase;font-family:monospace" />`)}
    </div>`
}

export function renderFillSection(computed: CSSStyleDeclaration): string {
  const bg = rgbToHex(computed.backgroundColor)
  const hasBg = computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'transparent'
  return `
    <div class="section">
      <div class="sec-hd">
        <span class="sec-title">填充</span>
        ${ibtn('plus', 'fill-add', { title: '添加填充' })}
      </div>
      ${hasBg ? colorSwatchField('fill', bg) : `<span style="font-size:10px;color:#8c8c8c">无填充</span>`}
    </div>`
}

export function renderStrokeSection(computed: CSSStyleDeclaration): string {
  const bc  = rgbToHex(computed.borderColor || '#000000')
  const bw  = pxVal(computed.borderWidth)
  const bs  = computed.borderStyle || 'none'
  const hasB = bs !== 'none' && bw !== '0'
  return `
    <div class="section">
      <div class="sec-hd">
        <span class="sec-title">描边</span>
        ${ibtn('plus', 'stroke-add', { title: '添加描边' })}
      </div>
      ${hasB ? `
      ${colorSwatchField('stroke', bc)}
      <div class="row mt4">
        ${field('W', numInput('stroke-w', bw, '0'))}
        <select class="msel" id="stroke-style" style="width:70px">
          ${[['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线']].map(([s, label]) =>
            `<option value="${s}" ${bs === s ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>` : `<span style="font-size:10px;color:#8c8c8c">无描边</span>`}
    </div>`
}

export function renderTextSection(computed: CSSStyleDeclaration, el: Element, fontOptions: string): string {
  const hasText = el.textContent?.trim() !== ''
  if (!hasText && el.children.length > 0) return ''

  const ta  = computed.textAlign || 'left'
  const fc  = rgbToHex(computed.color)
  const lh  = pxVal(computed.lineHeight)
  const ls  = pxVal(computed.letterSpacing)

  const taButtons = (['left', 'center', 'right', 'justify'] as const).map((a) => {
    const label = a === 'left' ? '≡' : a === 'center' ? '☰' : a === 'right' ? '≡' : '≣'
    return `<button class="sbtn${ta === a ? ' active' : ''}" data-ta="${a}" style="width:22px">${label}</button>`
  }).join('')

  return `
    <div class="section">
      <div class="sec-hd"><span class="sec-title">文字</span></div>
      <div class="row">
        <select class="fsel" id="txt-font">${fontOptions}</select>
      </div>
      <div class="row mt4">
        ${field('大小', numInput('txt-size', pxVal(computed.fontSize), '1'))}
        <select class="msel" id="txt-weight" style="width:70px">
          ${[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) =>
            `<option value="${w}" ${parseInt(computed.fontWeight) === w ? 'selected' : ''}>${w}</option>`
          ).join('')}
        </select>
      </div>
      <div class="row mt4">
        ${field('行高', numInput('txt-lh', lh, '0', '0.1'))}
        ${field('间距', numInput('txt-ls', ls, '', '0.1'))}
      </div>
      <div class="row mt4">
        <div class="cswatch">
          <div class="cswatch-bg" style="background:${fc}"></div>
          <input type="color" id="txt-color-picker" value="${fc}" />
        </div>
        ${field('', `<input type="text" id="txt-color-hex" value="${fc.replace('#', '')}" maxlength="6" style="text-align:left;text-transform:uppercase;font-family:monospace" />`)}
        <div class="seg" style="flex:none;width:auto;padding:2px;gap:2px">${taButtons}</div>
      </div>
      <div class="mt6">
        <textarea id="txt-content">${el.textContent?.trim() ?? ''}</textarea>
      </div>
    </div>`
}
