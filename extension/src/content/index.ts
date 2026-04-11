/**
 * Content Script entry point.
 * Initialises the toolbar and mode controllers, and wires them together.
 */

import { Toolbar, type Mode } from './toolbar'
import { InspectMode } from './inspect'
import { CommentMode } from './comment'
import { EditMode } from './edit/index'
import { RulerMode } from './ruler'
import { ChangesPanel } from './changesPanel'
import { wsClient } from './ws'
import { changeTracker } from './changes'
import { requestHistory } from './requestHistory.js'

// Prevent double-injection
if (document.querySelector('[data-design-easily="toolbar"]')) {
  throw new Error('Design Easily already loaded')
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const toolbar = new Toolbar()
const inspectMode = new InspectMode()
const editMode = new EditMode()
const commentMode = new CommentMode()
const rulerMode = new RulerMode()
new ChangesPanel()

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
setInterval(() => {
  toolbar.setServerStatus(wsClient.isConnected())
}, 2000)

// ─── Mode switching ───────────────────────────────────────────────────────────

let currentMode: Mode = null

function deactivateAll(): void {
  inspectMode.disable()
  editMode.disable()
  commentMode.disable()
  rulerMode.disable()
}

toolbar.onModeChange((mode: Mode) => {
  deactivateAll()
  currentMode = mode

  if (mode === 'inspect') inspectMode.enable()
  if (mode === 'edit') editMode.enable()
  if (mode === 'comment') commentMode.enable()
  if (mode === 'ruler') rulerMode.enable()
})

// ─── Export shortcuts ─────────────────────────────────────────────────────────

// Cmd/Ctrl+Shift+C → copy AI prompt
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
    const prompt = changeTracker.exportAIPrompt()
    navigator.clipboard.writeText(prompt).then(() => {
      showToast('AI Prompt 已复制到剪贴板')
    })
  }

  // Cmd/Ctrl+Shift+E → export JSON
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
    const json = changeTracker.exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `design-easily-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
})

// ─── Toast notification ───────────────────────────────────────────────────────

const TOAST_STYLES = `
  :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(30,30,32,0.82);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px;
    padding: 10px 18px;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    z-index: 2147483647;
    animation: fadeInUp 0.2s ease;
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`

function showToast(text: string, duration = 2500): void {
  const host = document.createElement('div')
  host.setAttribute('data-design-easily', 'toast')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${TOAST_STYLES}</style><div class="toast">${text}</div>`
  document.body.appendChild(host)
  setTimeout(() => host.remove(), duration)
}
