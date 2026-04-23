/**
 * Build a CSS selector that uniquely identifies an element within the page.
 *
 * When multiple siblings share the same tag, adds parent context and
 * nth-of-type so each element gets a distinct selector (and therefore a
 * distinct change-tracker dedup key).
 */
export function buildUniqueSelector(el: Element): string {
  if (el.id) return `#${el.id}`

  const tag = el.tagName.toLowerCase()
  const cls = el.classList[0] ? `.${el.classList[0]}` : ''
  const base = `${tag}${cls}`

  const parent = el.parentElement
  if (!parent || parent.tagName === 'BODY') return base

  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName)
  if (sameTag.length <= 1) return base

  // Multiple siblings with the same tag: add parent context + nth-of-type
  const nthOfType = sameTag.indexOf(el) + 1
  const parentSel = parent.id
    ? `#${parent.id}`
    : `${parent.tagName.toLowerCase()}${parent.classList[0] ? `.${parent.classList[0]}` : ''}`

  return `${parentSel} > ${base}:nth-of-type(${nthOfType})`
}
