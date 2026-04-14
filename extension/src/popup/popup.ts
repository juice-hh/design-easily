/**
 * Popup script — handles settings persistence and server status check.
 */

const DEFAULT_PORT = 3771

async function getSettings(): Promise<{ port: number; model: string }> {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ port: DEFAULT_PORT, model: 'claude-sonnet-4-6' }, (items) => {
      resolve(items as { port: number; model: string })
    })
  })
}

async function saveSettings(settings: { port: number; model: string }): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve)
  })
}

async function checkServerStatus(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

function setStatus(ok: boolean): void {
  const dot = document.getElementById('statusDot')
  const text = document.getElementById('statusText')
  if (dot) dot.className = `status-dot${ok ? ' ok' : ''}`
  if (text) text.textContent = ok ? '已连接' : '未连接（请启动本地服务）'
}

async function init(): Promise<void> {
  const settings = await getSettings()

  const portInput = document.getElementById('port') as HTMLInputElement
  const modelSelect = document.getElementById('model') as HTMLSelectElement

  portInput.value = String(settings.port)
  modelSelect.value = settings.model

  // Check server status
  const ok = await checkServerStatus(settings.port)
  setStatus(ok)

  // Save on change
  portInput.addEventListener('change', async () => {
    const port = parseInt(portInput.value, 10)
    if (port >= 1024 && port <= 65535) {
      await saveSettings({ port, model: modelSelect.value })
      setStatus(await checkServerStatus(port))
    }
  })

  modelSelect.addEventListener('change', async () => {
    await saveSettings({ port: parseInt(portInput.value, 10), model: modelSelect.value })
  })
}

init()

// ─── Activate current tab ─────────────────────────────────────────────────────

document.getElementById('activateBtn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'design:activate' })
  } catch {
    // Content script not yet injected (e.g. chrome:// pages) — silently ignore
  }
  window.close()
})
