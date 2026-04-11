# Request History Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "配置" tab to the existing ChangesPanel that displays in-memory MCP design request history with status badges and a copy action.

**Architecture:** A new `requestHistory.ts` observable store holds `DesignEntry[]` in memory; `inspect.ts` populates it on `design:queued`; `index.ts` updates it on subsequent WS events; `changesPanel.ts` subscribes to the store and renders the new tab.

**Tech Stack:** TypeScript strict, Vitest, Chrome Extension Shadow DOM (no external libs)

**Spec:** `docs/superpowers/specs/2026-04-11-request-history-panel-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `extension/src/content/requestHistory.ts` | Create | `DesignEntry` type + observable store (`add/update/getAll/onChange/pendingCount`) |
| `tests/unit/requestHistory.spec.ts` | Create | 8 unit tests for the store |
| `extension/src/content/inspect.ts` | Modify | On `design:queued` → `requestHistory.add()` |
| `extension/src/content/index.ts` | Modify | On processing/done/failed → `requestHistory.update()` |
| `extension/src/content/changesPanel.ts` | Modify | New 'config' tab, DesignEntry rendering, weakened toolbar buttons |
| `vitest.config.ts` | Modify | Add `requestHistory.ts` to coverage include list |

---

## Task 1: Create `requestHistory.ts` with tests (TDD)

**Files:**
- Create: `extension/src/content/requestHistory.ts`
- Create: `tests/unit/requestHistory.spec.ts`
- Modify: `vitest.config.ts`

### Step 1.1: Write failing tests

- [ ] Create `tests/unit/requestHistory.spec.ts` with this content:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { requestHistory } from '../../extension/src/content/requestHistory.js'

beforeEach(() => requestHistory._resetForTest())

describe('requestHistory — add', () => {
  it('adds a new entry; getAll returns it', () => {
    requestHistory.add({ id: 'a1', action: 'suggest', userMessage: 'make it blue', status: 'pending' })
    const all = requestHistory.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('a1')
    expect(all[0].action).toBe('suggest')
    expect(all[0].userMessage).toBe('make it blue')
    expect(all[0].status).toBe('pending')
    expect(typeof all[0].createdAt).toBe('number')
  })

  it('is idempotent — duplicate id is silently ignored', () => {
    requestHistory.add({ id: 'a1', action: 'suggest', userMessage: 'first', status: 'pending' })
    requestHistory.add({ id: 'a1', action: 'develop', userMessage: 'second', status: 'pending' })
    const all = requestHistory.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].userMessage).toBe('first')
  })
})

describe('requestHistory — update', () => {
  it('updates status and optional fields on an existing entry', () => {
    requestHistory.add({ id: 'b1', action: 'develop', userMessage: 'fix nav', status: 'pending' })
    requestHistory.update('b1', { status: 'completed', changedFiles: ['src/Nav.tsx'] })
    const entry = requestHistory.getAll()[0]
    expect(entry.status).toBe('completed')
    expect(entry.changedFiles).toEqual(['src/Nav.tsx'])
    // original fields preserved
    expect(entry.userMessage).toBe('fix nav')
  })

  it('is a no-op for an unknown id — does not throw', () => {
    expect(() => requestHistory.update('nonexistent', { status: 'failed' })).not.toThrow()
  })
})

describe('requestHistory — pendingCount', () => {
  it('counts entries with status pending or processing', () => {
    requestHistory.add({ id: 'c1', action: 'suggest', userMessage: 'q1', status: 'pending' })
    requestHistory.add({ id: 'c2', action: 'develop', userMessage: 'q2', status: 'pending' })
    requestHistory.update('c2', { status: 'processing' })
    requestHistory.add({ id: 'c3', action: 'develop', userMessage: 'q3', status: 'pending' })
    requestHistory.update('c3', { status: 'completed' })
    expect(requestHistory.pendingCount()).toBe(2) // c1 pending + c2 processing
  })
})

describe('requestHistory — onChange', () => {
  it('calls listener after add', () => {
    const cb = vi.fn()
    const unsub = requestHistory.onChange(cb)
    requestHistory.add({ id: 'd1', action: 'suggest', userMessage: 'x', status: 'pending' })
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('calls listener after update on an existing id', () => {
    requestHistory.add({ id: 'd2', action: 'develop', userMessage: 'y', status: 'pending' })
    const cb = vi.fn()
    const unsub = requestHistory.onChange(cb)
    requestHistory.update('d2', { status: 'processing' })
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('does NOT call listener after update on a non-existent id', () => {
    const cb = vi.fn()
    const unsub = requestHistory.onChange(cb)
    requestHistory.update('ghost', { status: 'failed' })
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})
```

### Step 1.2: Run tests — verify they fail

- [ ] Run: `npx vitest run tests/unit/requestHistory.spec.ts`
- Expected: FAIL — "Cannot find module '../../extension/src/content/requestHistory.js'"

### Step 1.3: Create `extension/src/content/requestHistory.ts`

- [ ] Create the file with this content:

```typescript
export interface DesignEntry {
  id: string
  action: 'suggest' | 'develop'
  userMessage: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  content?: string
  summary?: string
  changedFiles?: string[]
  error?: string
  createdAt: number
}

type Listener = () => void

class RequestHistory {
  private entries: DesignEntry[] = []
  private listeners: Set<Listener> = new Set()

  add(entry: Omit<DesignEntry, 'createdAt'>): void {
    if (this.entries.some((e) => e.id === entry.id)) return
    this.entries = [...this.entries, { ...entry, createdAt: Date.now() }]
    this.notify()
  }

  update(id: string, patch: Partial<Omit<DesignEntry, 'id' | 'createdAt'>>): void {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx === -1) return
    this.entries = this.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    this.notify()
  }

  getAll(): DesignEntry[] {
    return this.entries
  }

  pendingCount(): number {
    return this.entries.filter(
      (e) => e.status === 'pending' || e.status === 'processing',
    ).length
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }

  _resetForTest(): void {
    this.entries = []
    this.listeners.clear()
  }
}

export const requestHistory = new RequestHistory()
```

### Step 1.4: Run tests — verify they pass

- [ ] Run: `npx vitest run tests/unit/requestHistory.spec.ts`
- Expected: PASS — all 8 tests green

### Step 1.5: Add to coverage

- [ ] In `vitest.config.ts`, add `'extension/src/content/requestHistory.ts'` to the `coverage.include` array:

```typescript
// vitest.config.ts — coverage.include becomes:
include: [
  'server/src/**/*.ts',
  'extension/src/content/changes.ts',
  'extension/src/content/fiber.ts',
  'extension/src/content/requestHistory.ts',
],
```

### Step 1.6: Run full test suite to confirm nothing broke

- [ ] Run: `npx vitest run`
- Expected: all existing tests still pass

### Step 1.7: Commit

- [ ] Run:
```bash
git add extension/src/content/requestHistory.ts tests/unit/requestHistory.spec.ts vitest.config.ts
git commit -m "feat: add requestHistory observable store with unit tests"
```

---

## Task 2: Wire `inspect.ts` — call `requestHistory.add()` on `design:queued`

**Files:**
- Modify: `extension/src/content/inspect.ts` (lines 1–10 for import; lines 330–370 for InspectPanel class)

The challenge: `design:queued` arrives with only `{ id }`. The `action` and `userMessage` are known in `sendDesignRequest()` before the WS message is sent. Save them as instance fields so the WS listener can pick them up.

### Step 2.1: Add import at the top of `inspect.ts`

- [ ] After the existing imports (line 7), add:
```typescript
import { requestHistory } from './requestHistory.js'
```

Exact edit — replace:
```typescript
import { wsClient } from './ws'
```
with:
```typescript
import { wsClient } from './ws'
import { requestHistory } from './requestHistory.js'
```

### Step 2.2: Add two pending fields to `InspectPanel` class

- [ ] In the `InspectPanel` class (around line 334), after `private pendingRequestId: string | null = null`, add:

```typescript
private pendingAction: 'suggest' | 'develop' | null = null
private pendingUserMessage: string | null = null
```

Exact edit — replace:
```typescript
  private pendingRequestId: string | null = null
  private wsUnsubscribe: (() => void) | null = null
```
with:
```typescript
  private pendingRequestId: string | null = null
  private pendingAction: 'suggest' | 'develop' | null = null
  private pendingUserMessage: string | null = null
  private wsUnsubscribe: (() => void) | null = null
```

### Step 2.3: Set pending fields in `sendDesignRequest()`

- [ ] In `sendDesignRequest()` (around line 497), after the early-return guard, add the two assignments. Replace:

```typescript
    this.addMessage('user', text)
    if (textarea) textarea.value = ''

    this.addMessage('assistant', '⏳ 发送中...')
    this.setButtonsDisabled(true)
```
with:
```typescript
    this.pendingAction = action
    this.pendingUserMessage = text

    this.addMessage('user', text)
    if (textarea) textarea.value = ''

    this.addMessage('assistant', '⏳ 发送中...')
    this.setButtonsDisabled(true)
```

### Step 2.4: Call `requestHistory.add()` in the WS listener for `design:queued`

- [ ] In the WS listener (around line 347), replace:

```typescript
      if (msg.type === 'design:queued') {
        this.pendingRequestId = msg.id
        this.updateLastAssistantMessage('⏳ 已发送，等待 Claude Code...')
      }
```
with:
```typescript
      if (msg.type === 'design:queued') {
        this.pendingRequestId = msg.id
        this.updateLastAssistantMessage('⏳ 已发送，等待 Claude Code...')
        if (this.pendingAction !== null && this.pendingUserMessage !== null) {
          requestHistory.add({
            id: msg.id,
            action: this.pendingAction,
            userMessage: this.pendingUserMessage,
            status: 'pending',
          })
          this.pendingAction = null
          this.pendingUserMessage = null
        }
      }
```

### Step 2.5: TypeScript compile check

- [ ] Run: `npx tsc --noEmit -p extension/tsconfig.json` (or equivalent for the extension)
- Expected: no errors

If there's no `extension/tsconfig.json`, run from project root:
- [ ] Run: `npx tsc --noEmit`
- Expected: no type errors

### Step 2.6: Commit

- [ ] Run:
```bash
git add extension/src/content/inspect.ts
git commit -m "feat: inspect.ts calls requestHistory.add on design:queued"
```

---

## Task 3: Wire `index.ts` — `requestHistory.update()` on processing/done/failed

**Files:**
- Modify: `extension/src/content/index.ts`

### Step 3.1: Add imports to `index.ts`

- [ ] After the existing imports, add:

```typescript
import { requestHistory } from './requestHistory.js'
```

Exact edit — replace:
```typescript
import { wsClient } from './ws'
import { changeTracker } from './changes'
```
with:
```typescript
import { wsClient } from './ws'
import { changeTracker } from './changes'
import { requestHistory } from './requestHistory.js'
```

### Step 3.2: Add WS listener for design events

- [ ] After `wsClient.connect()` (around line 30), add a new `wsClient.onMessage()` block:

```typescript
// Update request history from WS design events
wsClient.onMessage((msg) => {
  if (msg.type === 'design:processing') {
    requestHistory.update(msg.id, { status: 'processing' })
  }
  if (msg.type === 'design:done') {
    requestHistory.update(msg.id, {
      status: 'completed',
      content: msg.content,
      summary: msg.summary,
      changedFiles: msg.changedFiles,
    })
  }
  if (msg.type === 'design:failed') {
    requestHistory.update(msg.id, { status: 'failed', error: msg.error })
  }
})
```

Exact edit — replace:
```typescript
// Connect to local service
wsClient.connect()

// Reflect server connection status in toolbar dot
```
with:
```typescript
// Connect to local service
wsClient.connect()

// Update request history from WS design events
wsClient.onMessage((msg) => {
  if (msg.type === 'design:processing') {
    requestHistory.update(msg.id, { status: 'processing' })
  }
  if (msg.type === 'design:done') {
    requestHistory.update(msg.id, {
      status: 'completed',
      content: msg.content,
      summary: msg.summary,
      changedFiles: msg.changedFiles,
    })
  }
  if (msg.type === 'design:failed') {
    requestHistory.update(msg.id, { status: 'failed', error: msg.error })
  }
})

// Reflect server connection status in toolbar dot
```

### Step 3.3: TypeScript compile check

- [ ] Run: `npx tsc --noEmit`
- Expected: no errors

### Step 3.4: Commit

- [ ] Run:
```bash
git add extension/src/content/index.ts
git commit -m "feat: index.ts updates requestHistory on design WS events"
```

---

## Task 4: Extend `changesPanel.ts` with "配置" tab

**Files:**
- Modify: `extension/src/content/changesPanel.ts`

This is the largest change. Work through it in sub-steps.

### Step 4.1: Add import

- [ ] Replace the existing import at line 7:

```typescript
import { changeTracker, type Change, type Comment } from './changes.js'
```
with:
```typescript
import { changeTracker, type Change, type Comment } from './changes.js'
import { requestHistory, type DesignEntry } from './requestHistory.js'
```

### Step 4.2: Extend the `Filter` type

- [ ] Replace line 9:

```typescript
type Filter = 'all' | 'style' | 'text' | 'comment'
```
with:
```typescript
type Filter = 'all' | 'style' | 'text' | 'comment' | 'config'
```

### Step 4.3: Add new CSS rules to `PANEL_STYLES`

- [ ] Append the following CSS rules inside the `PANEL_STYLES` template literal, just before the closing backtick. Find the last CSS rule:

```typescript
  .chevron.collapsed { transform: rotate(-90deg); }
`
```
and replace with:
```typescript
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
```

### Step 4.4: Add `unsubscribeHistory` field to `ChangesPanel` class

- [ ] In the `ChangesPanel` class, after `private unsubscribe: (() => void) | null = null`, add:

```typescript
  private unsubscribeHistory: (() => void) | null = null
```

Exact edit — replace:
```typescript
  private unsubscribe: (() => void) | null = null
```
with:
```typescript
  private unsubscribe: (() => void) | null = null
  private unsubscribeHistory: (() => void) | null = null
```

### Step 4.5: Subscribe to `requestHistory` in constructor

- [ ] In the constructor, replace:

```typescript
    this.unsubscribe = changeTracker.onChange(() => this.render())
    this.render()
```
with:
```typescript
    this.unsubscribe = changeTracker.onChange(() => this.render())
    this.unsubscribeHistory = requestHistory.onChange(() => this.render())
    this.render()
```

### Step 4.6: Update `render()` — filter tabs and toolbar buttons

The render method currently builds filter tabs from an array and uses `btn-primary`/`btn-ghost` classes. Replace the relevant section inside `render()`.

- [ ] Replace the filter tabs + export buttons section. Find:

```typescript
          <div class="filter-tabs">
            ${(['all','style','text','comment'] as Filter[]).map((f) => `
              <button class="filter-tab${this.filter === f ? ' active' : ''}" data-filter="${f}">
                ${{ all:'全部', style:'样式', text:'文本', comment:'评论' }[f]}
              </button>
            `).join('')}
          </div>
          <div class="export-btns">
            <button class="btn btn-ghost" data-action="import">导入 JSON</button>
            <button class="btn btn-ghost" data-action="export-json">导出 JSON</button>
            <button class="btn btn-primary" data-action="copy-prompt">复制 AI Prompt</button>
          </div>
```
and replace with:
```typescript
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
```

### Step 4.7: Update `render()` — list section to handle 'config' filter

- [ ] Replace the list rendering section in `render()`. Find:

```typescript
        ${this.expanded ? `
          <div class="list">
            ${filtered.length === 0
              ? `<div class="empty">${total === 0 ? '暂无变更' : '当前筛选无结果'}</div>`
              : filtered.map((item) => this.renderItem(item)).join('')
            }
          </div>
        ` : ''}
```
and replace with:
```typescript
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
```

Also update the `render()` method body to only compute `filtered` when not in config mode, to avoid unnecessary work. Find the section where `filtered` is built:

```typescript
    const changes = changeTracker.getChanges()
    const comments = changeTracker.getComments()
    const total = changes.length + comments.length

    const filtered = this.buildFiltered(changes, comments)
```
and replace with:
```typescript
    const changes = changeTracker.getChanges()
    const comments = changeTracker.getComments()
    const total = changes.length + comments.length

    const filtered = this.filter !== 'config' ? this.buildFiltered(changes, comments) : []
```

### Step 4.8: Add `renderConfigList()` method

- [ ] Add the following method to the `ChangesPanel` class, after the `renderItem()` method (around line 290):

```typescript
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
          : (entry.changedFiles?.join(', ') || entry.summary ?? '')
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
```

### Step 4.9: Verify generic filter handler covers 'config'

The existing `bindEvents()` filter handler reads:
```typescript
this.shadow.querySelectorAll('[data-filter]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    this.filter = btn.getAttribute('data-filter') as Filter
    this.render()
  })
})
```
Since `'config'` is now in the `Filter` type and the button has `data-filter="config"`, this handler already covers the new tab — **no additional code needed**.

### Step 4.10: Add copy-entry handler in `bindEvents()`

- [ ] In `bindEvents()`, after the existing item action listeners (after the `reset` querySelectorAll block), add:

```typescript
    // Copy design entry result (config tab only — escapeHtml is a new private method added in Step 4.8)
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
```

### Step 4.11: Update `destroy()` to unsubscribe history listener

- [ ] Replace the `destroy()` method:

```typescript
  destroy(): void {
    this.unsubscribe?.()
    this.host.remove()
  }
```
with:
```typescript
  destroy(): void {
    this.unsubscribe?.()
    this.unsubscribeHistory?.()
    this.host.remove()
  }
```

### Step 4.12: TypeScript compile check

- [ ] Run: `npx tsc --noEmit`
- Expected: no errors

### Step 4.13: Run full test suite

- [ ] Run: `npx vitest run`
- Expected: all tests pass

### Step 4.14: Commit

- [ ] Run:
```bash
git add extension/src/content/changesPanel.ts
git commit -m "feat: changesPanel adds config tab with MCP request history"
```

---

## Final verification

- [ ] Run: `npx vitest run --coverage`
- Expected: `requestHistory.ts` appears in coverage report; lines ≥ 80%

- [ ] Run: `npx tsc --noEmit`
- Expected: zero type errors
