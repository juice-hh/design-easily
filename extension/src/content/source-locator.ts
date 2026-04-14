/**
 * Content-script bridge for resolving component source locations via
 * the background service worker + Chrome Debugger Protocol.
 *
 * Instead of storing the function in window (isolated world — invisible to CDP),
 * we mark the target element with a temporary attribute so the background can
 * find it in the main world via Runtime.evaluate.
 */

export interface SourceLocation {
  file: string
  line: number
  column: number
}

const LOCATE_ATTR = 'data-de-locate'

/**
 * Mark the given element, ask the background service worker to resolve its
 * React component's [[FunctionLocation]] via Chrome Debugger Protocol,
 * then remove the marker. Resolves to null on any error or 5-second timeout.
 */
export async function resolveComponentSource(
  el: Element,
): Promise<SourceLocation | null> {
  el.setAttribute(LOCATE_ATTR, 'true')

  try {
    const result = await Promise.race([
      sendLocateMessage(),
      timeout(5000),
    ])
    return result
  } finally {
    el.removeAttribute(LOCATE_ATTR)
  }
}

function sendLocateMessage(): Promise<SourceLocation | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'locate-source' },
      (response: { file: string | null; line: number | null; column: number | null } | undefined) => {
        if (chrome.runtime.lastError) {
          resolve(null)
          return
        }
        if (response?.file == null || response.line == null) {
          resolve(null)
          return
        }
        resolve({ file: response.file, line: response.line, column: response.column ?? 0 })

      },
    )
  })
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms))
}
