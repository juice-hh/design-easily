/**
 * Change tracking — records all modifications made in edit/comment modes.
 * Provides export to AI Prompt and JSON.
 */

export type ChangeType = 'style' | 'text' | 'comment' | 'layout'

export interface LayoutContext {
  display: string
  position?: string
  flexDirection?: string
  justifyContent?: string
  alignItems?: string
  gap?: string
  gridTemplateColumns?: string
}

export interface Change {
  id: string
  type: ChangeType
  selector: string          // CSS selector for locating the element
  componentName: string | null
  sourceFile: string | null
  sourceLine: number | null
  property?: string         // For style changes
  oldValue?: string
  newValue?: string
  comment?: string          // For comment changes
  timestamp: number
  // Layout context captured at edit time — used by exportAIPrompt
  classList?: string[]
  parentClassList?: string[]
  parentLayoutCtx?: LayoutContext | null
}

export interface Comment {
  id: string
  selector: string
  componentName: string | null
  text: string
  timestamp: number
}

// ─── Intent helpers (module-level to keep class complexity low) ───────────────

function sizeIntentLabel(prop: string, delta: number): string {
  if (prop === 'width') return delta > 0 ? '视觉上变宽约' : '视觉上变窄约'
  return delta > 0 ? '视觉上变高约' : '视觉上变矮约'
}

function offsetDir(prop: string, delta: number): string {
  if (prop === 'left') return delta > 0 ? '右' : '左'
  return delta > 0 ? '下' : '上'
}

function layoutHint(isFlex: boolean, isGrid: boolean, prop: string): string {
  if (isFlex) {
    return prop === 'left'
      ? '（父容器为 flex，建议调整 margin 或元素间距）'
      : '（父容器为 flex，建议调整 align-self 或 margin）'
  }
  if (isGrid) return '（父容器为 grid，建议调整 grid 属性）'
  return ''
}

function changeToIntent(c: Change, isFlex: boolean, isGrid: boolean): string | null {
  const prop = c.property ?? ''
  const oldPx = Number.parseFloat(c.oldValue ?? '')
  const newPx = Number.parseFloat(c.newValue ?? '')
  const delta = newPx - oldPx

  if ((prop === 'width' || prop === 'height') && !Number.isNaN(oldPx) && oldPx > 0) {
    const pct = Math.round(Math.abs(delta) / oldPx * 100)
    return `${sizeIntentLabel(prop, delta)} ${pct}%`
  }
  if ((prop === 'left' || prop === 'top') && !Number.isNaN(delta) && delta !== 0) {
    const dir = offsetDir(prop, delta)
    const hint = layoutHint(isFlex, isGrid, prop)
    return `向${dir}偏移约 ${Math.abs(Math.round(delta))}px${hint}`
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────

class ChangeTracker {
  private changes: Change[] = []
  private comments: Comment[] = []
  private listeners: (() => void)[] = []

  addChange(change: Omit<Change, 'id' | 'timestamp'>): void {
    // Deduplicate: same element instance + property = update in place, keeping original oldValue.
    // Include sourceFile+sourceLine so different component types with the same CSS selector
    // don't collide; fall back to selector-only when source info is unavailable.
    const src = change.sourceFile ? `${change.sourceFile}:${change.sourceLine ?? ''}` : ''
    const key = `${change.selector}::${src}::${change.property ?? '__text__'}`
    const existing = this.changes.find(
      (c) => {
        const cSrc = c.sourceFile ? `${c.sourceFile}:${c.sourceLine ?? ''}` : ''
        return `${c.selector}::${cSrc}::${c.property ?? '__text__'}` === key && c.type === change.type
      },
    )
    if (existing) {
      // If reverted to original, remove entirely
      if (existing.oldValue === change.newValue) {
        this.changes = this.changes.filter((c) => c !== existing)
      } else {
        existing.newValue = change.newValue
        existing.timestamp = Date.now()
      }
    } else {
      this.changes = [...this.changes, {
        ...change,
        id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      }]
    }
    this.emit()
  }

  addComment(comment: Omit<Comment, 'id' | 'timestamp'>): Comment {
    const entry: Comment = {
      ...comment,
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }
    this.comments = [...this.comments, entry]
    this.emit()
    return entry
  }

  removeChange(id: string): void {
    this.changes = this.changes.filter((c) => c.id !== id)
    this.emit()
  }

  removeComment(id: string): void {
    this.comments = this.comments.filter((c) => c.id !== id)
    this.emit()
  }

  getChanges(): Change[] {
    return [...this.changes]
  }

  getComments(): Comment[] {
    return [...this.comments]
  }

  reset(): void {
    this.changes = []
    this.comments = []
    this.emit()
  }

  onChange(listener: () => void): () => void {
    this.listeners = [...this.listeners, listener]
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private emit(): void {
    this.listeners.forEach((l) => l())
  }

  exportJSON(): string {
    return JSON.stringify(
      { changes: this.changes, comments: this.comments },
      null,
      2,
    )
  }

  exportAIPrompt(): string {
    const groups = this.groupChangesByElement()
    const lines: string[] = [
      '# 设计修改需求',
      '',
      `共 ${groups.size} 个元素有改动（${this.changes.length} 处属性），${this.comments.length} 条评论。`,
      '',
    ]
    this.appendStyleLines(lines, groups)
    this.appendCommentLines(lines)
    lines.push(
      '\n---',
      '请根据以上修改需求，优先按照元素的类名和父容器布局方式修改源码，属性变化数值仅供参考。',
      '',
      '⚠️ 注意：如果目标元素是通过列表或循环渲染的（如 Array.map、v-for、*ngFor 等），请先判断此修改是否仅针对特定实例。若是，请为该实例添加独立 class 或 inline style 覆盖，而非直接修改共享 class，以避免影响所有同类实例。',
    )
    return lines.join('\n')
  }

  private groupChangesByElement(): Map<string, Change[]> {
    const groups = new Map<string, Change[]>()
    for (const c of this.changes) {
      const key = `${c.selector}::${c.sourceFile ?? ''}:${c.sourceLine ?? ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }
    return groups
  }

  private formatParentCtx(ctx: LayoutContext): string {
    const parts: string[] = [ctx.display]
    if (ctx.flexDirection) parts.push(ctx.flexDirection)
    if (ctx.justifyContent) parts.push(`justify: ${ctx.justifyContent}`)
    if (ctx.alignItems) parts.push(`align: ${ctx.alignItems}`)
    if (ctx.gap) parts.push(`gap: ${ctx.gap}`)
    if (ctx.gridTemplateColumns) parts.push(`columns: ${ctx.gridTemplateColumns}`)
    if (ctx.position) parts.push(`position: ${ctx.position}`)
    return parts.join('，')
  }

  private generateIntents(bucket: Change[]): string[] {
    const ctx = bucket[0]?.parentLayoutCtx
    const isFlex = ctx?.display === 'flex' || ctx?.display === 'inline-flex'
    const isGrid = ctx?.display === 'grid' || ctx?.display === 'inline-grid'
    return bucket
      .filter((c) => c.type === 'style')
      .flatMap((c) => {
        const intent = changeToIntent(c, isFlex, isGrid)
        return intent ? [intent] : []
      })
  }

  private appendElementHeader(lines: string[], first: Change): void {
    if (first.sourceFile) {
      lines.push(`**源文件：** \`${first.sourceFile}:${first.sourceLine}\``)
    }
    if (first.classList && first.classList.length > 0) {
      lines.push(`**元素类名：** \`${first.classList.join(' ')}\``)
    }
    const parentParts: string[] = []
    if (first.parentClassList && first.parentClassList.length > 0) {
      parentParts.push(`\`${first.parentClassList.join(' ')}\``)
    }
    if (first.parentLayoutCtx) {
      parentParts.push(`布局：${this.formatParentCtx(first.parentLayoutCtx)}`)
    }
    if (parentParts.length > 0) {
      lines.push(`**父容器：** ${parentParts.join(' | ')}`)
    }
  }

  private appendPropertyList(lines: string[], bucket: Change[]): void {
    lines.push('\n**属性变化（辅助参考）：**')
    for (const c of bucket) {
      if (c.type === 'style') {
        lines.push(`- \`${c.property}\`：\`${c.oldValue}\` → \`${c.newValue}\``)
      } else if (c.type === 'text') {
        lines.push(`- 文本：\`${c.oldValue}\` → \`${c.newValue}\``)
      }
    }
  }

  private appendStyleLines(lines: string[], groups: Map<string, Change[]>): void {
    if (groups.size === 0) return
    lines.push('## 样式与文本修改')
    for (const bucket of groups.values()) {
      const first = bucket[0]
      const heading = first.componentName
        ? `${first.componentName} — \`${first.selector}\``
        : `\`${first.selector}\``
      lines.push(`\n### ${heading}`)
      this.appendElementHeader(lines, first)

      const intents = this.generateIntents(bucket)
      if (intents.length > 0) {
        lines.push('\n**修改意图：**')
        intents.forEach((i) => lines.push(`- ${i}`))
      }

      this.appendPropertyList(lines, bucket)
    }
  }

  private appendCommentLines(lines: string[]): void {
    if (this.comments.length === 0) return
    lines.push('\n## 评论与备注')
    for (const c of this.comments) {
      lines.push(`\n- **${c.componentName ?? c.selector}**：${c.text}`)
    }
  }

  importJSON(json: string): void {
    try {
      const data = JSON.parse(json) as { changes: Change[]; comments: Comment[] }
      this.changes = data.changes ?? []
      this.comments = data.comments ?? []
      this.emit()
    } catch {
      throw new Error('Invalid JSON format')
    }
  }
}

export const changeTracker = new ChangeTracker()
