/**
 * Toolbar — floating top-center toolbar with mode switcher.
 * Uses Shadow DOM for style isolation.
 * Apple frosted-glass style.
 */

export type Mode = 'inspect' | 'edit' | 'config' | 'comment' | null

type ModeChangeHandler = (mode: Mode) => void
type RulerToggleHandler = (on: boolean) => void

const RULER_ICON = `<svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor"><path d="M872.803 755.994h0.061v-0.37z m-44.873-646.08l-245.394 0.09c-2.91-0.456-7.087-0.368-7.82-0.09H196.067c-47.545 0-86.268 38.695-86.268 86.224v631.908c0 47.545 38.723 86.269 86.268 86.269h149.16c47.573 0 86.267-38.724 86.267-86.269V416.983H852.54c1.855 0-1.881-0.148 0-0.53 31.844 1.985 61.659-26.256 61.659-56.276v-164.01c0-47.528-38.724-86.253-86.27-86.253M858.1 326.1c3.527 35.886-40.136 32.446-40.136 32.446h-419.4c-1.793 0.574-3.234 1.382-4.822 2.058-0.763 0.295-1.47 0.559-2.174 0.897-10.057 4.822-16.174 12.04-16.174 25.258v437.144c0 18.906-15.407 34.284-34.282 34.284H200.213c-18.906 0-34.283-15.378-34.283-34.284v-77.77h139.457c16.141 0 29.226-13.114 29.226-29.227s-13.085-29.257-29.226-29.257H165.929v-95.087h95.589c16.113 0 29.255-13.145 29.255-29.285 0-16.055-13.143-29.198-29.255-29.198h-95.59V438.96h139.458c16.141 0 29.226-13.113 29.226-29.256 0-16.113-13.085-29.24-29.226-29.24H165.929V200.328c0-18.907 15.378-34.299 34.283-34.299h173.094v103.704c0 16.553 13.085 30.049 29.255 30.049 16.113 0 29.228-13.496 29.228-30.049V166.03H548.84v81.754c0 16.553 13.112 30.02 29.194 30.02 16.143 0 29.256-13.467 29.256-30.02V166.03h95.12v103.704c0 16.553 13.143 30.049 29.254 30.049 16.113 0 29.198-13.496 29.198-30.049V166.03h62.922c18.905 0 34.312 15.392 34.312 34.299v125.77z"/></svg>`

interface ToolbarItem {
  id: Mode
  icon: string
  label: string
  shortcut?: string
}

const TOOLS: ToolbarItem[] = [
  {
    id: 'inspect',
    icon: `<svg viewBox="30 190 964 590" width="18" height="18" fill="currentColor"><path d="M965.76 453.76l-231.04-231.04a48.256 48.256 0 0 0-67.84 0c-18.56 18.56-18.56 49.28 0 67.84l201.6 201.6-201.6 200.96c-18.56 18.56-18.56 49.28 0 67.84 9.6 9.6 21.76 14.08 33.92 14.08s24.32-4.48 33.92-14.08l231.04-231.04c21.12-21.12 21.12-54.4 0-76.16zM357.12 222.72a48.256 48.256 0 0 0-67.84 0L58.24 453.76c-21.12 21.12-21.12 54.4 0.64 76.8l231.04 230.4c9.6 9.6 21.76 14.08 33.92 14.08s24.32-4.48 33.92-14.08c18.56-18.56 18.56-49.28 0-67.84L155.52 492.16l201.6-201.6c18.56-18.56 18.56-49.28 0-67.84zM591.36 209.92a48 48 0 0 0-58.88 33.92l-128 480c-7.04 25.6 8.32 51.84 33.92 58.88 3.84 1.28 8.32 1.92 12.16 1.92 21.12 0 40.32-14.08 46.08-35.84l128-480c7.68-25.6-7.68-51.84-33.28-58.88z"/></svg>`,
    label: '开发',
    shortcut: 'I',
  },
  {
    id: 'edit',
    icon: `<svg viewBox="80 80 864 864" width="18" height="18" fill="currentColor"><path d="M751.914667 886.016c-9.024 0-18.026667-3.434667-24.896-10.304l-123.754667-123.754667-48.512 107.050667a34.645333 34.645333 0 0 1-33.6 20.629333 34.986667 34.986667 0 0 1-31.68-23.466666l-144.298667-406.826667a34.922667 34.922667 0 0 1 8.32-36.650667 34.944 34.944 0 0 1 36.672-8.32l406.826667 144.298667a35.072 35.072 0 0 1 23.445333 31.701333 35.114667 35.114667 0 0 1-20.650666 33.6l-107.029334 48.512 123.733334 123.733334a35.285333 35.285333 0 0 1 0 49.834666l-39.68 39.658667a35.136 35.136 0 0 1-24.896 10.304"/><path d="M290.794667 604.096H288a74.666667 74.666667 0 0 1-74.666667-74.666667V288a74.666667 74.666667 0 0 1 74.666667-74.666667h448a74.666667 74.666667 0 0 1 74.666667 74.666667v176.896a32 32 0 1 0 64 0V288A138.666667 138.666667 0 0 0 736 149.333333h-448A138.688 138.688 0 0 0 149.333333 288v241.429333a138.666667 138.666667 0 0 0 138.666667 138.666667h2.794667a32 32 0 0 0 0-64"/></svg>`,
    label: '编辑',
    shortcut: 'E',
  },
  {
    id: 'comment',
    icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    label: '评论',
    shortcut: 'C',
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
  private rulerHandlers: RulerToggleHandler[] = []
  private rulerActive = false
  private serverDot: HTMLElement | null = null
  private hidden = false

  constructor() {
    this.host = document.createElement('div')
    this.host.dataset['designEasily'] = 'toolbar'
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
        <button class="tool-btn${this.rulerActive ? ' active' : ''}" data-action="ruler" data-tooltip="标尺  R">
          ${RULER_ICON}
        </button>
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

    this.shadow.querySelectorAll<HTMLButtonElement>('.tool-btn[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset['mode'] as Mode
        this.setMode(this.activeMode === mode ? null : mode)
      })
    })

    this.shadow.querySelector<HTMLButtonElement>('[data-action="ruler"]')?.addEventListener('click', () => {
      this.rulerActive = !this.rulerActive
      this.shadow.querySelector('[data-action="ruler"]')?.classList.toggle('active', this.rulerActive)
      this.rulerHandlers.forEach((h) => h(this.rulerActive))
    })

    this.shadow.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.setMode(null)
      document.dispatchEvent(new CustomEvent('design:destroy'))
      this.destroy()
    })
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    // composedPath() 穿透 Shadow DOM，确保捕捉到 shadow 内的 input/textarea
    const path = e.composedPath()
    if (path.some((el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return

    if (e.key === 'Tab') {
      e.preventDefault()
      this.toggle()
      return
    }

    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.rulerActive = !this.rulerActive
      this.shadow.querySelector('[data-action="ruler"]')?.classList.toggle('active', this.rulerActive)
      this.rulerHandlers.forEach((h) => h(this.rulerActive))
      return
    }

    const modeMap: Record<string, Mode> = {
      i: 'inspect', I: 'inspect',
      e: 'edit', E: 'edit',
      g: 'config', G: 'config',
      c: 'comment', C: 'comment',
    }
    const mode = modeMap[e.key]
    if (mode && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.setMode(this.activeMode === mode ? null : mode)
    }
  }

  setMode(mode: Mode): void {
    this.activeMode = mode
    this.shadow.querySelectorAll<HTMLButtonElement>('.tool-btn[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['mode'] === mode)
    })
    this.handlers.forEach((h) => h(mode))
  }

  onModeChange(handler: ModeChangeHandler): void {
    this.handlers.push(handler)
  }

  onRulerToggle(handler: RulerToggleHandler): void {
    this.rulerHandlers.push(handler)
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
