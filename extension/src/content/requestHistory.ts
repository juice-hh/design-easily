export interface DesignEntry {
  id: string
  action: 'suggest' | 'develop'
  userMessage: string
  status: 'pending' | 'processing' | 'analyzing' | 'completed' | 'failed'
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
    return [...this.entries]
  }

  pendingCount(): number {
    return this.entries.filter(
      (e) => e.status === 'pending' || e.status === 'processing' || e.status === 'analyzing',
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
