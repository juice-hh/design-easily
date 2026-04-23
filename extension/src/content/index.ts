/**
 * Content Script entry point.
 * Initialises the toolbar and mode controllers on demand (per-tab activation).
 * The toolbar is only created when the popup sends a 'design:activate' message.
 */

import { Toolbar, type Mode } from './toolbar'
import { InspectMode } from './inspect'
import { EditMode } from './edit/index'
import { ConfigPanel } from './configPanel'
import { RulerMode } from './ruler'
import { CommentMode } from './comment'
import { wsClient } from './ws'
import { changeTracker } from './changes'
import { requestHistory } from './requestHistory.js'
import { Z } from './tokens.js'

// ─── Per-tab activation ───────────────────────────────────────────────────────

let initialized = false
let toolbarInstance: Toolbar | null = null

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'design:activate') {
    if (initialized) {
      // Already active on this tab — just make sure toolbar is visible
      toolbarInstance?.show()
    } else {
      initialized = true
      toolbarInstance = initDesignEasily()
    }
    sendResponse({ ok: true })
  }
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function initDesignEasily(): Toolbar {
  const toolbar = new Toolbar()
  const inspectMode = new InspectMode()
  const editMode = new EditMode()
  const configPanel = new ConfigPanel()
  const rulerMode = new RulerMode()
  const commentMode = new CommentMode()

  // Connect to local service
  wsClient.connect()

  // Update request history from WS design events
  const unsubMessage = wsClient.onMessage((msg) => {
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

  // Reflect server connection status in toolbar dot reactively
  const unsubStatus = wsClient.onStatusChange((connected) => {
    toolbar.setServerStatus(connected)
  })

  // ─── Mode switching ─────────────────────────────────────────────────────────

  function deactivateAll(): void {
    inspectMode.disable()
    editMode.disable()
    configPanel.hide()
    commentMode.disable()
  }

  toolbar.onModeChange((mode: Mode) => {
    deactivateAll()
    if (mode === 'inspect') inspectMode.enable()
    if (mode === 'edit') editMode.enable()
    if (mode === 'config') configPanel.show()
    if (mode === 'comment') commentMode.enable()
  })

  toolbar.onRulerToggle((on) => {
    if (on) rulerMode.enablePassive()
    else rulerMode.disablePassive()
  })

  // ─── Export shortcuts ───────────────────────────────────────────────────────

  const onKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
      const prompt = changeTracker.exportAIPrompt()
      navigator.clipboard.writeText(prompt).then(() => {
        showToast('AI Prompt 已复制到剪贴板')
      }).catch(() => {
        showToast('复制失败，请检查剪贴板权限')
      })
    }

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
  }

  document.addEventListener('keydown', onKeyDown)

  // ─── Destroy (close button) ─────────────────────────────────────────────────

  document.addEventListener('design:destroy', () => {
    unsubMessage()
    unsubStatus()
    document.removeEventListener('keydown', onKeyDown)
    deactivateAll()
    rulerMode.disablePassive()
    rulerMode.destroy()
    commentMode.destroy()
    inspectMode.destroy()
    editMode.destroy()
    configPanel.destroy()
    changeTracker.reset()
    initialized = false
    toolbarInstance = null
  }, { once: true })

  return toolbar
}

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
    z-index: ${Z.TOOLBAR};
    animation: fadeInUp 0.2s ease;
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`

export function showToast(text: string, duration = 2500): void {
  const host = document.createElement('div')
  host.dataset['designEasily'] = 'toast'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${TOAST_STYLES}</style><div class="toast">${text}</div>`
  document.body.appendChild(host)
  setTimeout(() => host.remove(), duration)
}
