/**
 * Event-binding helpers for PropertiesPanel.
 * Extracted to keep properties.ts under 500 lines.
 * Each function takes primitive/callback dependencies so it stays independent
 * of the PropertiesPanel class and is easily unit-tested.
 */

import type { StyleEdit } from './properties.js'

type ApplyFn = (prop: string, value: string) => void
type RenderFn = () => void

export function bindNum(sh: ShadowRoot, apply: ApplyFn, id: string, prop: string, suffix = 'px'): void {
  sh.getElementById(id)?.addEventListener('change', (e) => {
    apply(prop, (e.target as HTMLInputElement).value + suffix)
  })
}

export function bindColorPair(sh: ShadowRoot, apply: ApplyFn, prefix: string, cssProp: string): void {
  const picker = sh.getElementById(`${prefix}-picker`) as HTMLInputElement | null
  const hexIn  = sh.getElementById(`${prefix}-hex`) as HTMLInputElement | null

  const applyHex = (hex: string): void => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
    const bg = sh.querySelector<HTMLDivElement>(`#${prefix}-picker`)
      ?.closest('.cswatch')?.querySelector<HTMLDivElement>('.cswatch-bg')
    if (picker) picker.value = hex
    if (hexIn)  hexIn.value = hex.replace('#', '').toUpperCase()
    if (bg)     bg.style.background = hex
    apply(cssProp, hex)
  }

  picker?.addEventListener('input', () => applyHex(picker.value))
  hexIn?.addEventListener('change', () => applyHex('#' + hexIn.value))
}

export function bindPositionEvents(sh: ShadowRoot, el: HTMLElement, apply: ApplyFn, render: RenderFn): void {
  const hAlignMap: Record<string, () => void> = {
    'al-left':  () => { apply('marginLeft', '');     apply('marginRight', 'auto') },
    'al-ch':    () => { apply('marginLeft', 'auto'); apply('marginRight', 'auto') },
    'al-right': () => { apply('marginLeft', 'auto'); apply('marginRight', '') },
  }
  Object.entries(hAlignMap).forEach(([id, fn]) => {
    sh.getElementById(id)?.addEventListener('click', () => { fn(); render() })
  })

  const vAlignMap: Record<string, string> = {
    'al-top': 'flex-start', 'al-mid': 'center', 'al-bottom': 'flex-end',
  }
  Object.entries(vAlignMap).forEach(([id, val]) => {
    sh.getElementById(id)?.addEventListener('click', () => { apply('alignSelf', val); render() })
  })

  bindNum(sh, apply, 'pos-x', 'left')
  bindNum(sh, apply, 'pos-y', 'top')

  sh.getElementById('pos-rot')?.addEventListener('change', (e) => {
    apply('transform', `rotate(${(e.target as HTMLInputElement).value}deg)`)
  })
  sh.getElementById('btn-fliph')?.addEventListener('click', () => {
    const cur = globalThis.getComputedStyle(el).transform
    apply('transform', cur.includes('scaleX(-1)') ? '' : 'scaleX(-1)')
  })
  sh.getElementById('btn-flipv')?.addEventListener('click', () => {
    const cur = globalThis.getComputedStyle(el).transform
    apply('transform', cur.includes('scaleY(-1)') ? '' : 'scaleY(-1)')
  })
}

export function bindResizeEvents(sh: ShadowRoot, apply: ApplyFn): void {
  const applyResize = (axis: 'w' | 'h'): void => {
    const numEl  = sh.getElementById(`resize-${axis}`) as HTMLInputElement | null
    const modeEl = sh.getElementById(`resize-${axis}-mode`) as HTMLSelectElement | null
    if (!numEl || !modeEl) return
    const prop = axis === 'w' ? 'width' : 'height'
    switch (modeEl.value) {
      case 'hug':  apply(prop, 'fit-content'); apply('flex', '');  break
      case 'fill': apply(prop, '100%');        apply('flex', '1'); break
      default:     apply(prop, numEl.value + 'px'); apply('flex', '')
    }
  }
  sh.getElementById('resize-w')?.addEventListener('change', () => applyResize('w'))
  sh.getElementById('resize-h')?.addEventListener('change', () => applyResize('h'))
  sh.getElementById('resize-w-mode')?.addEventListener('change', () => applyResize('w'))
  sh.getElementById('resize-h-mode')?.addEventListener('change', () => applyResize('h'))
}

export function bindAutoLayoutEvents(sh: ShadowRoot, el: HTMLElement, apply: ApplyFn, render: RenderFn): void {
  sh.getElementById('al-toggle')?.addEventListener('click', () => {
    apply('display', globalThis.getComputedStyle(el).display === 'flex' ? '' : 'flex')
    render()
  })

  const flowMap: Record<string, () => void> = {
    'flow-row':     () => { apply('flexDirection', 'row');    apply('flexWrap', 'nowrap') },
    'flow-col':     () => { apply('flexDirection', 'column'); apply('flexWrap', 'nowrap') },
    'flow-rowwrap': () => { apply('flexDirection', 'row');    apply('flexWrap', 'wrap') },
    'flow-rev': () => {
      const cur = globalThis.getComputedStyle(el).flexDirection
      apply('flexDirection', cur.includes('reverse') ? cur.replace('-reverse', '') : cur + '-reverse')
    },
  }
  Object.entries(flowMap).forEach(([id, fn]) => {
    sh.getElementById(id)?.addEventListener('click', () => { fn(); render() })
  })

  bindResizeEvents(sh, apply)

  sh.querySelectorAll<HTMLButtonElement>('.agbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      apply('alignItems',     btn.dataset['ai'] ?? 'flex-start')
      apply('justifyContent', btn.dataset['jc'] ?? 'flex-start')
      render()
    })
  })

  bindNum(sh, apply, 'al-gap', 'gap')
  sh.getElementById('pad-h')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value + 'px'
    apply('paddingLeft', v); apply('paddingRight', v)
  })
  sh.getElementById('pad-v')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value + 'px'
    apply('paddingTop', v); apply('paddingBottom', v)
  })
  sh.getElementById('al-clip')?.addEventListener('change', (e) => {
    apply('overflow', (e.target as HTMLInputElement).checked ? 'hidden' : 'visible')
  })
}

export function bindAppearanceEvents(sh: ShadowRoot, el: HTMLElement, apply: ApplyFn, render: RenderFn): void {
  sh.getElementById('ap-opacity')?.addEventListener('change', (e) => {
    apply('opacity', String(Number.parseFloat((e.target as HTMLInputElement).value) / 100))
  })
  bindNum(sh, apply, 'ap-radius', 'borderRadius')
  sh.getElementById('btn-corner-ind')?.addEventListener('click', () => render())
  ;(['ap-tl', 'ap-tr', 'ap-br', 'ap-bl'] as const).forEach((id, i) => {
    const props = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
    bindNum(sh, apply, id, props[i] as string)
  })
  sh.getElementById('btn-vis')?.addEventListener('click', () => {
    apply('visibility', globalThis.getComputedStyle(el).visibility === 'hidden' ? 'visible' : 'hidden')
  })
}

export function bindFillStrokeEvents(sh: ShadowRoot, apply: ApplyFn, render: RenderFn): void {
  bindColorPair(sh, apply, 'fill', 'backgroundColor')
  sh.getElementById('fill-add')?.addEventListener('click', () => {
    apply('backgroundColor', '#ffffff'); render()
  })
  bindColorPair(sh, apply, 'stroke', 'borderColor')
  bindNum(sh, apply, 'stroke-w', 'borderWidth')
  sh.getElementById('stroke-style')?.addEventListener('change', (e) => {
    apply('borderStyle', (e.target as HTMLSelectElement).value)
  })
  sh.getElementById('stroke-add')?.addEventListener('click', () => {
    apply('borderWidth', '1px')
    apply('borderStyle', 'solid')
    apply('borderColor', '#000000')
    render()
  })
}

export function bindTextEvents(
  sh: ShadowRoot,
  el: HTMLElement,
  apply: ApplyFn,
  render: RenderFn,
  recordChange: (prop: string, oldVal: string, newVal: string) => void,
  notifyChange: (edit: StyleEdit) => void,
): void {
  sh.getElementById('txt-font')?.addEventListener('change', (e) => {
    apply('fontFamily', (e.target as HTMLSelectElement).value)
  })
  bindNum(sh, apply, 'txt-size', 'fontSize')
  sh.getElementById('txt-weight')?.addEventListener('change', (e) => {
    apply('fontWeight', (e.target as HTMLSelectElement).value)
  })
  bindNum(sh, apply, 'txt-lh', 'lineHeight')
  bindNum(sh, apply, 'txt-ls', 'letterSpacing')
  bindColorPair(sh, apply, 'txt-color', 'color')

  sh.querySelectorAll<HTMLButtonElement>('[data-ta]').forEach((b) => {
    b.addEventListener('click', () => { apply('textAlign', b.dataset['ta'] ?? 'left'); render() })
  })

  const textarea = sh.getElementById('txt-content') as HTMLTextAreaElement | null
  if (textarea) {
    textarea.addEventListener('change', () => {
      const old = el.textContent?.trim() ?? ''
      el.textContent = textarea.value
      recordChange('textContent', old, textarea.value)
      notifyChange({ property: 'textContent', value: textarea.value })
    })
  }
}
