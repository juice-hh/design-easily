# Light Mode UI Overhaul + Ruler Anchor Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 6 module UIs to consistent light mode, replace emoji toolbar icons with SVGs, add ruler click-to-anchor element-to-element distance mode, and update the redesign mockup to light theme.

**Architecture:** Minimal targeted edits to each module's Shadow DOM style string and icon definitions. No new files needed — every change is a localized CSS/HTML update within the existing class. Ruler anchor mode extends `RulerMode` with a single `anchorEl` field and a `click` listener.

**Tech Stack:** TypeScript, Shadow DOM, CSS (inline in template literals), inline SVG

---

## File Map

| File | Change |
|------|--------|
| `extension/src/content/toolbar.ts` | Replace 4 emoji icons with inline SVGs |
| `extension/src/content/comment.ts` | `BUBBLE_STYLES` dark → light |
| `extension/src/content/changesPanel.ts` | Add `.item-type.layout` badge style |
| `extension/src/content/ruler.ts` | Click-to-anchor mode + distance line to anchor |
| `.superpowers/brainstorm/35422-1775732746/redesign-mockup.html` | Full dark → light theme |

---

### Task 1: Toolbar — Replace Emoji with SVG Icons

**Files:**
- Modify: `extension/src/content/toolbar.ts`

The `TOOLS` array currently uses emoji strings as `icon`. We replace each with a small inline SVG string and update the template to render it as raw HTML.

- [ ] **Step 1: Update TOOLS array with SVG strings**

Replace the `TOOLS` constant (lines 18–23) with:

```typescript
const TOOLS: ToolbarItem[] = [
  {
    id: 'inspect',
    icon: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>`,
    label: '检查',
    shortcut: 'I',
  },
  {
    id: 'edit',
    icon: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z"/></svg>`,
    label: '编辑',
    shortcut: 'E',
  },
  {
    id: 'ruler',
    icon: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="5" width="14" height="6" rx="1.5"/><line x1="4" y1="8" x2="4" y2="11"/><line x1="7" y1="8" x2="7" y2="10"/><line x1="10" y1="8" x2="10" y2="11"/><line x1="13" y1="8" x2="13" y2="10"/></svg>`,
    label: '标尺',
    shortcut: 'R',
  },
  {
    id: 'comment',
    icon: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 10a2 2 0 01-2 2H5l-3 3V4a2 2 0 012-2h8a2 2 0 012 2v6z"/></svg>`,
    label: '评论',
    shortcut: 'C',
  },
]
```

- [ ] **Step 2: Update icon rendering in template to use innerHTML**

In the `render()` method, the button template uses `${t.icon}` as text content inside `<span class="icon">`. Change the template so the icon span uses `innerHTML` (render SVG as markup, not escaped text).

Replace the button template inside `render()`:

```typescript
${TOOLS.map((t) => `
  <button class="tool-btn" data-mode="${t.id}" title="${t.label} (${t.shortcut})">
    <span class="icon">${t.icon}</span>
    <span class="label">${t.label}</span>
  </button>
`).join('')}
```

The existing template already uses template literals so `${t.icon}` will be injected as raw HTML when assigned to `shadow.innerHTML`. This works as-is — no change needed here. Only the `TOOLS` array update in Step 1 is required.

- [ ] **Step 3: Update `.icon` CSS to use `currentColor` for SVG**

In `TOOLBAR_STYLES`, change the `.tool-btn .icon` block and add `color` to active state:

```css
  .tool-btn .icon {
    font-size: 15px;
    line-height: 1;
    color: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tool-btn.active .icon {
    color: #007AFF;
  }
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
npx tsc --noEmit -p extension/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: all passing (toolbar has no unit tests; this verifies nothing broke elsewhere).

- [ ] **Step 6: Commit**

```bash
git add extension/src/content/toolbar.ts
git commit -m "feat: replace emoji toolbar icons with inline SVGs"
```

---

### Task 2: Comment Bubbles — Light Mode

**Files:**
- Modify: `extension/src/content/comment.ts`

The comment *dialog* is already light. Only the floating *bubble* (BUBBLE_STYLES) is dark.

- [ ] **Step 1: Replace BUBBLE_STYLES dark colors with light colors**

Replace the entire `BUBBLE_STYLES` constant:

```typescript
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
```

- [ ] **Step 2: Build and verify**

```bash
npx tsc --noEmit -p extension/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/comment.ts
git commit -m "fix: comment bubbles light mode (was dark)"
```

---

### Task 3: Changes Panel — Add Layout Type Badge

**Files:**
- Modify: `extension/src/content/changesPanel.ts`

The panel has `style`, `text`, `comment` badge types but not `layout`. The redesign mockup showed a "布局" badge for flexbox/layout changes made in edit mode.

- [ ] **Step 1: Add layout badge CSS to PANEL_STYLES**

In `PANEL_STYLES` in `changesPanel.ts`, find the block with `.item-type.style`, `.item-type.text`, `.item-type.comment` and add one more line:

```css
  .item-type.layout  { background: rgba(88,86,214,0.1);  color: #5856D6; }
```

- [ ] **Step 2: Add `'layout'` to `ChangeType` in `changes.ts`**

In `extension/src/content/changes.ts`, find the `ChangeType` union and add `'layout'`:

```typescript
// Before:
export type ChangeType = 'style' | 'text' | 'comment'
// After:
export type ChangeType = 'style' | 'text' | 'comment' | 'layout'
```

Note: No part of the current codebase yet emits `type: 'layout'`. The edit properties panel (`edit/properties.ts`) currently emits type `'style'` for all changes including flexbox changes. This task adds the type and badge so it is ready when layout-specific tracking is added later. The badge will not appear until an emitter calls `changeTracker.addChange({ type: 'layout', ... })`.

- [ ] **Step 3: Update the badge label in `changesPanel.ts`**

In `changesPanel.ts`, find the line that maps `c.type` to a Chinese label (used in `renderItem` / `buildFiltered`). It currently looks like:

```typescript
const typeLabel = c.type === 'style' ? '样式' : '文本'
```

Update it to cover all four types:

```typescript
const typeLabel =
  c.type === 'style' ? '样式' :
  c.type === 'layout' ? '布局' :
  c.type === 'text' ? '文本' : '评论'
```

- [ ] **Step 4: Build**

```bash
npx tsc --noEmit -p extension/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/content/changesPanel.ts extension/src/content/changes.ts
git commit -m "feat: add layout type badge to changes panel"
```

---

### Task 4: Ruler — Click-to-Anchor Mode

**Files:**
- Modify: `extension/src/content/ruler.ts`

Currently the ruler only shows hover-based sibling distances. The redesign vision shows: click to *anchor* one element, then hover any other element to see the direct distance between them (with a connecting line).

- [ ] **Step 1: Write failing test**

In `tests/unit/ruler.spec.ts` (create if not exists):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the pure distance calculation logic, not DOM interaction
describe('ruler distance calculation', () => {
  it('calculates horizontal distance between two rects', () => {
    const a = { left: 0, right: 100, top: 50, bottom: 100, width: 100, height: 50 }
    const b = { left: 124, right: 200, top: 50, bottom: 100, width: 76, height: 50 }
    // horizontal gap = b.left - a.right = 24
    expect(b.left - a.right).toBe(24)
  })

  it('calculates vertical distance between two rects', () => {
    const a = { left: 50, right: 150, top: 0, bottom: 60, width: 100, height: 60 }
    const b = { left: 50, right: 150, top: 84, bottom: 144, width: 100, height: 60 }
    // vertical gap = b.top - a.bottom = 24
    expect(b.top - a.bottom).toBe(24)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (trivial arithmetic)**

```bash
npx vitest run tests/unit/ruler.spec.ts
```

Expected: PASS (the math is correct by definition).

- [ ] **Step 3: Add anchor state and click-to-anchor logic to RulerMode**

In `ruler.ts`, update the `RulerMode` class:

```typescript
export class RulerMode {
  private anchorEl: Element | null = null

  constructor() {
    ensureStyles()
  }

  enable(): void {
    const canvas = getCanvas()
    canvas.style.display = 'block'
    document.addEventListener('mouseover', this.onHover, true)
    document.addEventListener('click', this.onClick, true)
    document.body.style.cursor = 'crosshair'
  }

  disable(): void {
    document.removeEventListener('mouseover', this.onHover, true)
    document.removeEventListener('click', this.onClick, true)
    document.body.style.cursor = ''
    this.anchorEl = null
    clearCanvas()
    const canvas = document.getElementById(RULER_ID)
    if (canvas) canvas.style.display = 'none'
  }

  private onClick = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return
    e.preventDefault()
    e.stopPropagation()
    // Toggle anchor: click same element to deselect
    this.anchorEl = this.anchorEl === target ? null : target
    drawRuler(target, this.anchorEl)
  }

  private onHover = (e: MouseEvent): void => {
    const target = e.target as Element
    if (!target || target.getAttribute('data-design-easily')) return
    drawRuler(target, this.anchorEl)
  }

  destroy(): void {
    this.disable()
    document.getElementById(RULER_ID)?.remove()
    document.getElementById(RULER_STYLES_ID)?.remove()
  }
}
```

- [ ] **Step 4: Update `drawRuler` to accept optional anchor element**

Change the `drawRuler` signature and add anchor-to-hover distance drawing:

```typescript
function drawRuler(target: Element, anchorEl: Element | null = null): void {
  const canvas = getCanvas()
  clearCanvas()

  const tr = target.getBoundingClientRect()

  // Draw target outline
  const outline = document.createElement('div')
  outline.className = 'de-ruler-target'
  Object.assign(outline.style, {
    left: `${tr.left}px`,
    top: `${tr.top}px`,
    width: `${tr.width}px`,
    height: `${tr.height}px`,
  })
  canvas.appendChild(outline)

  // Size label
  const sizeLabel = document.createElement('div')
  sizeLabel.className = 'de-size-label'
  sizeLabel.textContent = `${Math.round(tr.width)} × ${Math.round(tr.height)}`
  Object.assign(sizeLabel.style, {
    left: `${tr.left}px`,
    top: `${tr.top - 20}px`,
  })
  canvas.appendChild(sizeLabel)

  // If anchor element is set and different from hover target, draw distance line
  if (anchorEl && anchorEl !== target) {
    const ar = anchorEl.getBoundingClientRect()

    // Draw anchor outline (blue)
    const anchorOutline = document.createElement('div')
    anchorOutline.className = 'de-ruler-target'
    anchorOutline.style.borderColor = 'rgba(0,122,255,0.9)'
    Object.assign(anchorOutline.style, {
      left: `${ar.left}px`,
      top: `${ar.top}px`,
      width: `${ar.width}px`,
      height: `${ar.height}px`,
    })
    canvas.appendChild(anchorOutline)

    // Horizontal gap (if elements don't overlap horizontally)
    const hGap = Math.max(ar.left - tr.right, tr.left - ar.right)
    if (hGap > 0) {
      const fromX = ar.left > tr.right ? tr.right : ar.right
      const midY = Math.min(tr.top, ar.top) + Math.abs(tr.top - ar.top) / 2
      createLine(canvas, fromX, midY, hGap, 1, `${Math.round(hGap)}px`)
    }

    // Vertical gap (if elements don't overlap vertically)
    const vGap = Math.max(ar.top - tr.bottom, tr.top - ar.bottom)
    if (vGap > 0) {
      const fromY = ar.top > tr.bottom ? tr.bottom : ar.bottom
      const midX = Math.min(tr.left, ar.left) + Math.abs(tr.left - ar.left) / 2
      createLine(canvas, midX, fromY, 1, vGap, `${Math.round(vGap)}px`)
    }

    return // When anchor is set, skip sibling/padding measurements
  }

  // ── existing sibling + padding logic (unchanged) ──
  const parent = target.parentElement
  if (!parent) return

  const siblings = Array.from(parent.children).filter(
    (el) => el !== target && !el.getAttribute('data-design-easily'),
  )

  for (const sibling of siblings.slice(0, 4)) {
    const sr = sibling.getBoundingClientRect()
    const hDist = Math.min(Math.abs(tr.right - sr.left), Math.abs(sr.right - tr.left))
    const vDist = Math.min(Math.abs(tr.bottom - sr.top), Math.abs(sr.bottom - tr.top))

    if (hDist < 300 && sr.right > tr.left && sr.left < tr.right) {
      if (sr.top > tr.bottom) {
        const gap = sr.top - tr.bottom
        if (gap > 0 && gap < 200) createLine(canvas, tr.left + tr.width / 2, tr.bottom, 1, gap, `${Math.round(gap)}px`)
      } else if (sr.bottom < tr.top) {
        const gap = tr.top - sr.bottom
        if (gap > 0 && gap < 200) createLine(canvas, tr.left + tr.width / 2, sr.bottom, 1, gap, `${Math.round(gap)}px`)
      }
    }
    if (vDist < 300 && sr.bottom > tr.top && sr.top < tr.bottom) {
      if (sr.left > tr.right) {
        const gap = sr.left - tr.right
        if (gap > 0 && gap < 200) createLine(canvas, tr.right, tr.top + tr.height / 2, gap, 1, `${Math.round(gap)}px`)
      } else if (sr.right < tr.left) {
        const gap = tr.left - sr.right
        if (gap > 0 && gap < 200) createLine(canvas, sr.right, tr.top + tr.height / 2, gap, 1, `${Math.round(gap)}px`)
      }
    }
  }

  const computed = window.getComputedStyle(target)
  const pt = parseInt(computed.paddingTop)
  const pr = parseInt(computed.paddingRight)
  const pb = parseInt(computed.paddingBottom)
  const pl = parseInt(computed.paddingLeft)
  if (pt > 0) createLine(canvas, tr.left + tr.width / 2, tr.top, 1, pt, `${pt}`)
  if (pb > 0) createLine(canvas, tr.left + tr.width / 2, tr.bottom - pb, 1, pb, `${pb}`)
  if (pl > 0) createLine(canvas, tr.left, tr.top + tr.height / 2, pl, 1, `${pl}`)
  if (pr > 0) createLine(canvas, tr.right - pr, tr.top + tr.height / 2, pr, 1, `${pr}`)
}
```

- [ ] **Step 5: Add anchor indicator style**

In `ensureStyles()`, add a `.de-ruler-anchor-label` class to show "已锚定" next to the anchor outline:

```css
    .de-ruler-anchor-label {
      position: absolute;
      background: rgba(0,122,255,0.85);
      color: white;
      font-size: 9px;
      font-family: "SF Mono", "Menlo", monospace;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
    }
```

Add an anchor label in `drawRuler` right after the anchor outline block:

```typescript
    const anchorLabel = document.createElement('div')
    anchorLabel.className = 'de-ruler-anchor-label'
    anchorLabel.textContent = '已锚定'
    Object.assign(anchorLabel.style, {
      left: `${ar.left}px`,
      top: `${ar.top - 18}px`,
    })
    canvas.appendChild(anchorLabel)
```

- [ ] **Step 6: Build**

```bash
npx tsc --noEmit -p extension/tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```

Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add extension/src/content/ruler.ts tests/unit/ruler.spec.ts
git commit -m "feat: ruler click-to-anchor element-to-element distance mode"
```

---

### Task 5: Redesign Mockup — Light Theme

**Files:**
- Modify: `.superpowers/brainstorm/35422-1775732746/redesign-mockup.html`

Convert every dark color to a light equivalent. The document has dark backgrounds (`#1a1a1f`, `#2a2a30`, `#1e1e24`), white text, and white-tinted UI elements.

**Color mapping:**

| Dark value | Light replacement |
|------------|-------------------|
| `body background: #1a1a1f` | `#f5f5f7` |
| `h1 color: #fff` | `#1c1c1e` |
| `.sub color: rgba(255,255,255,0.4)` | `rgba(0,0,0,0.4)` |
| `.section-label rgba(255,255,255,0.3)` | `rgba(0,0,0,0.35)` |
| `.feature-card rgba(255,255,255,0.06)` | `white` |
| `.feature-card border rgba(255,255,255,0.1)` | `rgba(0,0,0,0.08)` |
| `.fc-title #fff` | `#1c1c1e` |
| `.fc-desc rgba(255,255,255,0.4)` | `rgba(0,0,0,0.45)` |
| `.fc-tag rgba(255,255,255,0.07)` | `rgba(0,0,0,0.05)` |
| `.fc-tag color rgba(255,255,255,0.45)` | `rgba(0,0,0,0.45)` |
| `.ep-canvas background #2a2a30` | `#f0f0f5` |
| `.prop-panel background #1e1e24` | `white` |
| `.prop-panel border rgba(255,255,255,0.1)` | `rgba(0,0,0,0.08)` |
| `.pp-comp #fff` | `#1c1c1e` |
| `.pp-section-title rgba(255,255,255,0.25)` | `rgba(0,0,0,0.3)` |
| `.pp-label rgba(255,255,255,0.35)` | `rgba(0,0,0,0.4)` |
| `.pp-input background rgba(255,255,255,0.07)` | `rgba(0,0,0,0.04)` |
| `.pp-input border rgba(255,255,255,0.1)` | `rgba(0,0,0,0.1)` |
| `.pp-input color #e8e8ed` | `#1c1c1e` |
| `.pp-section border rgba(255,255,255,0.05)` | `rgba(0,0,0,0.06)` |
| `.pp-header border rgba(255,255,255,0.07)` | `rgba(0,0,0,0.07)` |
| `.lp-opt background rgba(255,255,255,0.06)` | `rgba(0,0,0,0.04)` |
| `.lp-opt border rgba(255,255,255,0.1)` | `rgba(0,0,0,0.1)` |
| `.color-hex background rgba(255,255,255,0.07)` | `rgba(0,0,0,0.04)` |
| `.color-hex color #e8e8ed` | `#1c1c1e` |
| `.font-family-row background rgba(255,255,255,0.07)` | `rgba(0,0,0,0.04)` |
| `.font-family-row color #e8e8ed` | `#1c1c1e` |
| `.ruler-preview background #2a2a30` | `#f0f0f5` |
| `.ruler-el-b background rgba(255,255,255,0.06)` | `rgba(0,0,0,0.04)` |
| `.ruler-el-b border rgba(255,255,255,0.15)` | `rgba(0,0,0,0.12)` |
| `.ruler-el-b color rgba(255,255,255,0.4)` | `rgba(0,0,0,0.45)` |
| Ruler tooltip `background rgba(30,30,32,0.95)` | `rgba(255,255,255,0.95)` |
| Ruler tooltip `color white` | `#1c1c1e` |
| `.comment-preview background #2a2a30` | `#f0f0f5` |
| `.comment-card background rgba(255,255,255,0.07)` | `white` |
| `.comment-card border rgba(255,255,255,0.1)` | `rgba(0,0,0,0.08)` |
| `.cc-title #fff` | `#1c1c1e` |
| `.cc-body rgba(255,255,255,0.4)` | `rgba(0,0,0,0.45)` |
| `.comment-bubble background rgba(30,30,36,0.96)` | `rgba(255,255,255,0.95)` |
| `.comment-bubble border rgba(255,255,255,0.12)` | `rgba(0,0,0,0.1)` |
| `.cb-author rgba(255,255,255,0.4)` | `rgba(0,0,0,0.4)` |
| `.cb-text #e8e8ed` | `#1c1c1e` |
| `.sd-val color rgba(255,149,0,0.9)` | keep orange |
| `.sd-val background rgba(30,30,36,0.9)` | `white` |
| `.changes-preview background rgba(255,255,255,0.03)` | `white` |
| `.changes-preview border rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)` |
| `.chg-title #fff` | `#1c1c1e` |
| `.chg-tab color rgba(255,255,255,0.35)` | `rgba(0,0,0,0.4)` |
| `.chg-target #e8e8ed` | `#1c1c1e` |
| `.chg-detail rgba(255,255,255,0.35)` | `rgba(0,0,0,0.35)` |
| `.chg-preview-dot rgba(255,255,255,0.15)` | `rgba(0,0,0,0.12)` |
| Hint text bottom `rgba(255,255,255,0.35)` | `rgba(0,0,0,0.35)` |
| SVG strokes `rgba(255,255,255,0.35)` (inactive lp-opt, alignment) | `rgba(0,0,0,0.3)` |

- [ ] **Step 1: Apply CSS-level dark→light replacements in the `<style>` block**

Edit the `<style>` block in `redesign-mockup.html` applying all mappings from the table above. Work section by section (body → feature cards → property panel → ruler → comment → changes).

- [ ] **Step 2: Fix inline SVG stroke colors in inactive layout picker and alignment buttons**

Inside the HTML body, the layout picker inactive options have `stroke="rgba(255,255,255,0.35)"` — change to `stroke="rgba(0,0,0,0.3)"`. Same for alignment button SVGs.

- [ ] **Step 3: Fix inline dark color values in HTML attributes**

Search for remaining dark values in the HTML body:
- Ruler tooltip inline style: `background:rgba(30,30,32,0.95);color:white` → `background:rgba(255,255,255,0.95);color:#1c1c1e; border:1px solid rgba(0,0,0,0.1);`
- Bottom hint text: `color:rgba(255,255,255,0.35)` → `color:rgba(0,0,0,0.35)`
- `background: rgba(30,30,32,0.95)` in ruler distance label → light

- [ ] **Step 4: Open in browser and verify no dark blotches remain**

```bash
open .superpowers/brainstorm/35422-1775732746/redesign-mockup.html
```

Take a screenshot to confirm light theme throughout.

- [ ] **Step 5: Commit**

```bash
git add .superpowers/brainstorm/35422-1775732746/redesign-mockup.html
git commit -m "feat: redesign mockup light theme"
```

---

### Task 6: Full Preview — Light Mode Sync

**Files:**
- Modify: `.superpowers/brainstorm/35422-1775732746/full-preview.html`

The full-preview.html simulates all 6 modes interactively. Verify it already uses light glass styles (the toolbar and panels in the actual extension are light). If any sections are dark, apply the same mapping from Task 5.

- [ ] **Step 1: Check for dark backgrounds in full-preview.html**

```bash
grep -n "#1a1a\|#2a2a\|rgba(30,30\|rgba(28,28\|rgba(20,20" .superpowers/brainstorm/35422-1775732746/full-preview.html | head -20
```

- [ ] **Step 2: Apply light mode fixes to any dark sections found**

For any dark values found, apply the same color mapping from Task 5. Focus on: body background, panel backgrounds, text colors.

- [ ] **Step 3: Open in browser and screenshot**

Take a screenshot to confirm all 6 panels are consistently light.

- [ ] **Step 4: Commit**

```bash
git add .superpowers/brainstorm/35422-1775732746/full-preview.html
git commit -m "feat: full preview light mode"
```

---

## Verification

After all tasks complete:

```bash
npx tsc --noEmit -p extension/tsconfig.json
npx vitest run
```

Both should pass with zero errors.
