/**
 * Change tracking — records all modifications made in edit/comment modes.
 * Provides export to AI Prompt and JSON.
 */

export type ChangeType = 'style' | 'text' | 'comment' | 'layout'

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
}

export interface Comment {
  id: string
  selector: string
  componentName: string | null
  text: string
  timestamp: number
}

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
    const lines: string[] = [
      '# 设计修改需求',
      '',
      `共 ${this.changes.length} 处样式/文本修改，${this.comments.length} 条评论。`,
      '',
    ]

    if (this.changes.length > 0) {
      lines.push('## 样式与文本修改')
      for (const c of this.changes) {
        lines.push(`\n### ${c.componentName ?? c.selector}`)
        if (c.sourceFile) lines.push(`源文件：\`${c.sourceFile}:${c.sourceLine}\``)
        if (c.type === 'style') {
          lines.push(`修改属性：\`${c.property}\``)
          lines.push(`原值：\`${c.oldValue}\` → 新值：\`${c.newValue}\``)
        }
        if (c.type === 'text') {
          lines.push(`原文：${c.oldValue}`)
          lines.push(`新文：${c.newValue}`)
        }
      }
    }

    if (this.comments.length > 0) {
      lines.push('\n## 评论与备注')
      for (const c of this.comments) {
        lines.push(`\n- **${c.componentName ?? c.selector}**：${c.text}`)
      }
    }

    lines.push('\n---')
    lines.push('请根据以上修改需求，给出对应的代码改动。')

    return lines.join('\n')
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
