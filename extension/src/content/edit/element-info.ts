/**
 * Captures element class and parent layout context at edit time.
 * Used to give Claude semantic layout hints instead of raw computed values.
 */

import type { LayoutContext } from '../changes.js'

export interface ElementInfo {
  classList: string[]
  parentClassList: string[]
  parentLayoutCtx: LayoutContext | null
}

const FLEX_DISPLAYS = new Set(['flex', 'inline-flex'])
const GRID_DISPLAYS = new Set(['grid', 'inline-grid'])

function buildFlexCtx(cs: CSSStyleDeclaration): LayoutContext {
  const ctx: LayoutContext = { display: cs.display }
  ctx.flexDirection = cs.flexDirection
  if (cs.justifyContent !== 'normal' && cs.justifyContent !== 'flex-start') {
    ctx.justifyContent = cs.justifyContent
  }
  if (cs.alignItems !== 'normal' && cs.alignItems !== 'stretch') {
    ctx.alignItems = cs.alignItems
  }
  if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') ctx.gap = cs.gap
  return ctx
}

function buildGridCtx(cs: CSSStyleDeclaration): LayoutContext {
  const ctx: LayoutContext = { display: cs.display }
  if (cs.justifyContent !== 'normal') ctx.justifyContent = cs.justifyContent
  if (cs.alignItems !== 'normal' && cs.alignItems !== 'stretch') ctx.alignItems = cs.alignItems
  if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') ctx.gap = cs.gap
  if (cs.gridTemplateColumns !== 'none') ctx.gridTemplateColumns = cs.gridTemplateColumns
  return ctx
}

export function captureElementInfo(el: Element): ElementInfo {
  const classList = Array.from(el.classList)
  const parent = el.parentElement
  const parentClassList = parent ? Array.from(parent.classList) : []

  if (!parent) return { classList, parentClassList, parentLayoutCtx: null }

  const cs = globalThis.getComputedStyle(parent)
  const { display } = cs

  let parentLayoutCtx: LayoutContext | null = null
  if (FLEX_DISPLAYS.has(display)) {
    parentLayoutCtx = buildFlexCtx(cs)
  } else if (GRID_DISPLAYS.has(display)) {
    parentLayoutCtx = buildGridCtx(cs)
  } else if (cs.position !== 'static') {
    parentLayoutCtx = { display, position: cs.position }
  } else {
    parentLayoutCtx = { display }
  }

  return { classList, parentClassList, parentLayoutCtx }
}
