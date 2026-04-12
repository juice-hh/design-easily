/**
 * Toolbar — floating top-center toolbar with mode switcher.
 * Uses Shadow DOM for style isolation.
 * Apple frosted-glass style.
 */

export type Mode = 'inspect' | 'edit' | 'config' | null

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
    icon: `<svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor"><path d="M64 368c26.24 0 48-21.76 48-48V160c0-26.24 21.76-48 48-48H320c26.24 0 48-21.76 48-48S346.24 16 320 16H160C80.64 16 16 80.64 16 160V320c0 26.24 21.76 48 48 48zM320 912H160c-26.24 0-48-21.76-48-48V704c0-26.24-21.76-48-48-48s-48 21.76-48 48v160c0 79.36 64.64 144 144 144H320c26.24 0 48-21.76 48-48s-21.76-48-48-48zM960 656c-26.24 0-48 21.76-48 48v160c0 26.24-21.76 48-48 48H704c-26.24 0-48 21.76-48 48s21.76 48 48 48h160c79.36 0 144-64.64 144-144V704c0-26.24-21.76-48-48-48zM864 16H704c-26.24 0-48 21.76-48 48s21.76 48 48 48h160c26.24 0 48 21.76 48 48V320c0 26.24 21.76 48 48 48s48-21.76 48-48V160c0-79.36-64.64-144-144-144z"/><path d="M734.08 801.92c9.6 9.6 21.76 14.08 33.92 14.08s24.32-4.48 33.92-14.08c18.56-18.56 18.56-49.28 0-67.84l-110.08-110.08c28.16-40.96 44.16-90.24 44.16-144 0-141.44-114.56-256-256-256s-256 114.56-256 256 114.56 256 256 256c53.12 0 103.04-16.64 144-44.16l110.08 110.08zM320 480a160 160 0 0 1 320 0 160 160 0 0 1-320 0z"/></svg>`,
    label: '审查',
    shortcut: 'I',
  },
  {
    id: 'edit',
    icon: `<svg viewBox="80 80 864 864" width="18" height="18" fill="currentColor"><path d="M751.914667 886.016c-9.024 0-18.026667-3.434667-24.896-10.304l-123.754667-123.754667-48.512 107.050667a34.645333 34.645333 0 0 1-33.6 20.629333 34.986667 34.986667 0 0 1-31.68-23.466666l-144.298667-406.826667a34.922667 34.922667 0 0 1 8.32-36.650667 34.944 34.944 0 0 1 36.672-8.32l406.826667 144.298667a35.072 35.072 0 0 1 23.445333 31.701333 35.114667 35.114667 0 0 1-20.650666 33.6l-107.029334 48.512 123.733334 123.733334a35.285333 35.285333 0 0 1 0 49.834666l-39.68 39.658667a35.136 35.136 0 0 1-24.896 10.304"/><path d="M290.794667 604.096H288a74.666667 74.666667 0 0 1-74.666667-74.666667V288a74.666667 74.666667 0 0 1 74.666667-74.666667h448a74.666667 74.666667 0 0 1 74.666667 74.666667v176.896a32 32 0 1 0 64 0V288A138.666667 138.666667 0 0 0 736 149.333333h-448A138.688 138.688 0 0 0 149.333333 288v241.429333a138.666667 138.666667 0 0 0 138.666667 138.666667h2.794667a32 32 0 0 0 0-64"/></svg>`,
    label: '编辑',
    shortcut: 'E',
  },
  {
    id: 'config',
    icon: `<svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor"><path d="M492 451.6c-8.4 11.1-20.4 19.5-34.8 23.3-75 19.8-211.1 45.3-279.3-6.1C88.6 401.4 70.8 274 138.2 184.7S333 77.6 422.3 145c68.2 51.5 80.9 189.3 82.4 266.9 0.4 14.7-4.3 28.5-12.7 39.7zM192.2 225.3c-44.9 59.5-33.1 144.5 26.5 189.4 31.4 23.7 116.9 21.9 218.4-4.5-2.4-104.9-24.1-187.6-55.5-211.3-59.5-45-144.4-33.1-189.4 26.4zM520.6 411.8c1.5-77.6 14.3-215.4 82.4-266.9 89.3-67.4 216.7-49.6 284.1 39.7s49.6 216.7-39.7 284.1c-68.2 51.5-204.2 25.9-279.3 6.1-14.3-3.8-26.4-12.1-34.8-23.3-8.3-11.1-13-24.9-12.7-39.7z m123.1-213c-31.4 23.7-53.1 106.5-55.5 211.3 101.5 26.4 187.1 28.2 218.4 4.5 59.5-44.9 71.4-129.9 26.5-189.4s-129.8-71.3-189.4-26.4zM504.8 614.3c-1.5 77.6-14.3 215.4-82.4 266.9-89.3 67.4-216.7 49.6-284.1-39.7S88.7 624.8 178 557.4c68.2-51.5 204.2-25.9 279.3-6.1 14.3 3.8 26.4 12.1 34.8 23.3 8.3 11.1 13 24.9 12.7 39.7z m-123.1 213c31.4-23.7 53.1-106.5 55.5-211.3-101.5-26.4-187.1-28.2-218.4-4.5-59.5 44.9-71.4 129.9-26.5 189.4 44.9 59.4 129.8 71.3 189.4 26.4zM533.4 574.5c8.4-11.1 20.4-19.5 34.8-23.3 75-19.8 211.1-45.3 279.3 6.1 89.3 67.4 107.1 194.8 39.7 284.1S692.3 948.6 603 881.2c-68.2-51.5-80.9-189.3-82.4-266.9-0.3-14.8 4.4-28.6 12.8-39.8z m299.8 226.3c44.9-59.5 33.1-144.5-26.5-189.4-31.4-23.7-116.9-21.9-218.4 4.5 2.4 104.9 24.1 187.6 55.5 211.3 59.5 45 144.4 33.1 189.4-26.4z"/></svg>`,
    label: '配置',
    shortcut: 'G',
  },
]

const TOOLBAR_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
    pointer-events: none;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 4px;
    background: rgba(28, 28, 30, 0.85);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 22px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset;
    pointer-events: all;
    user-select: none;
  }
  .tb-logo {
    font-size: 11px;
    font-weight: 800;
    color: rgba(255,255,255,0.75);
    letter-spacing: -0.05em;
    padding: 0 8px 0 6px;
    flex-shrink: 0;
    pointer-events: none;
  }
  .divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 3px;
    flex-shrink: 0;
  }
  .tool-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1.5px solid transparent;
    background: transparent;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.4);
    transition: all 0.12s;
    padding: 0;
  }
  .tool-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.85);
  }
  .tool-btn.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.92);
  }
  .tool-btn svg { flex-shrink: 0; }
  /* hover tooltip */
  .tool-btn::after {
    content: attr(data-tooltip);
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(28, 28, 30, 0.95);
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.85);
    font-size: 10px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    z-index: 1;
  }
  .tool-btn:hover::after { opacity: 1; }
  .close-btn {
    color: rgba(255,255,255,0.3);
    margin-left: 2px;
  }
  .close-btn:hover {
    color: rgba(255, 80, 80, 0.9);
    background: rgba(255, 59, 48, 0.12);
  }
  .server-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    margin-left: 4px;
    margin-right: 4px;
    transition: background 0.3s;
    flex-shrink: 0;
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
        <span class="tb-logo">DE</span>
        <div class="divider"></div>
        ${TOOLS.map((t) => `
          <button class="tool-btn" data-mode="${t.id}" data-tooltip="${t.label}  ${t.shortcut}">
            ${t.icon}
          </button>
        `).join('')}
        <div class="divider"></div>
        <div class="server-dot" title="本地服务状态"></div>
        <button class="tool-btn close-btn" data-action="close" data-tooltip="关闭">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `

    this.serverDot = this.shadow.querySelector('.server-dot')

    this.shadow.querySelectorAll('.tool-btn[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as Mode
        this.setMode(this.activeMode === mode ? null : mode)
      })
    })

    this.shadow.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.setMode(null)
      document.dispatchEvent(new CustomEvent('design:destroy'))
      this.destroy()
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
      g: 'config', G: 'config',
    }
    const mode = modeMap[e.key]
    if (mode && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.setMode(this.activeMode === mode ? null : mode)
    }
  }

  setMode(mode: Mode): void {
    this.activeMode = mode
    this.shadow.querySelectorAll('.tool-btn[data-mode]').forEach((btn) => {
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

  show(): void {
    this.hidden = false
    this.host.style.display = ''
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
