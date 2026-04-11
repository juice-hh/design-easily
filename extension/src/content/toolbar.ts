/**
 * Toolbar — floating top-center toolbar with mode switcher.
 * Uses Shadow DOM for style isolation.
 * Apple frosted-glass style.
 */

export type Mode = 'inspect' | 'edit' | 'comment' | 'ruler' | null

type ModeChangeHandler = (mode: Mode) => void

interface ToolbarItem {
  id: Mode
  icon: string
  label: string
  shortcut?: string
}

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

const TOOLBAR_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
    pointer-events: none;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 14px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset;
    pointer-events: all;
    user-select: none;
  }
  .tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 40px;
    border: none;
    background: transparent;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: inherit;
    gap: 2px;
  }
  .tool-btn:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  .tool-btn.active {
    background: rgba(0, 122, 255, 0.12);
  }
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
  .tool-btn .label {
    font-size: 9px;
    color: rgba(0,0,0,0.5);
    letter-spacing: 0.2px;
    font-weight: 500;
  }
  .tool-btn.active .label {
    color: #007AFF;
  }
  .divider {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.1);
    margin: 0 4px;
  }
  .server-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ccc;
    margin-left: 6px;
    transition: background 0.3s;
  }
  .server-dot.connected {
    background: #34C759;
  }
`

export class Toolbar {
  private host: HTMLElement
  private shadow: ShadowRoot
  private activeMode: Mode = null
  private handlers: ModeChangeHandler[] = []
  private serverDot: HTMLElement | null = null
  private hidden = false

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-design-easily', 'toolbar')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    this.render()
    document.body.appendChild(this.host)

    document.addEventListener('keydown', this.handleKeyDown)
  }

  private render(): void {
    this.shadow.innerHTML = `
      <style>${TOOLBAR_STYLES}</style>
      <div class="toolbar">
        ${TOOLS.map((t) => `
          <button class="tool-btn" data-mode="${t.id}" title="${t.label} (${t.shortcut})">
            <span class="icon">${t.icon}</span>
            <span class="label">${t.label}</span>
          </button>
        `).join('')}
        <div class="divider"></div>
        <div class="server-dot" title="本地服务状态"></div>
      </div>
    `

    this.serverDot = this.shadow.querySelector('.server-dot')

    this.shadow.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as Mode
        this.setMode(this.activeMode === mode ? null : mode)
      })
    })
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (e.key === 'Tab') {
      e.preventDefault()
      this.toggle()
      return
    }

    const modeMap: Record<string, Mode> = {
      i: 'inspect', I: 'inspect',
      e: 'edit', E: 'edit',
      r: 'ruler', R: 'ruler',
      c: 'comment', C: 'comment',
    }
    const mode = modeMap[e.key]
    if (mode && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.setMode(this.activeMode === mode ? null : mode)
    }
  }

  setMode(mode: Mode): void {
    this.activeMode = mode
    this.shadow.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode)
    })
    this.handlers.forEach((h) => h(mode))
  }

  onModeChange(handler: ModeChangeHandler): void {
    this.handlers.push(handler)
  }

  setServerStatus(connected: boolean): void {
    this.serverDot?.classList.toggle('connected', connected)
  }

  toggle(): void {
    this.hidden = !this.hidden
    this.host.style.display = this.hidden ? 'none' : ''
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown)
    this.host.remove()
  }
}
