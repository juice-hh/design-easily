/**
 * Background service worker.
 * Listens for 'locate-source' messages from content scripts and uses
 * Chrome Debugger Protocol to resolve React component function locations
 * via [[FunctionLocation]] internal property + sourcemap lookup.
 */

import { fetchAndResolveSourcemap } from './sourcemap.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScriptInfo {
  url: string
  sourceMapURL: string
}

interface LocateSourceResponse {
  file: string | null
  line: number | null
  column: number | null
}

interface EvaluateResult {
  result: { objectId?: string; type?: string; value?: unknown }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

interface FunctionLocation {
  scriptId: string
  lineNumber: number
  columnNumber: number
}

interface InternalProperty {
  name: string
  value?: {
    objectId?: string
    // Chrome returns [[FunctionLocation]] with subtype 'internal#location'
    // and the location data directly in value.value (not via objectId)
    value?: FunctionLocation
    subtype?: string
  }
}

interface GetPropertiesResult {
  result: Array<{ name: string; value?: { value?: unknown; objectId?: string } }>
  internalProperties?: InternalProperty[]
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: LocateSourceResponse) => void,
  ) => {
    if (message.type !== 'locate-source') return false

    const tabId = sender.tab?.id
    if (tabId == null) {
      console.error('[DE bg] locate-source: no tabId in sender')
      sendResponse({ file: null, line: null, column: null })
      return true
    }

    locateSource(tabId)
      .then(sendResponse)
      .catch((err) => {
        console.error('[DE bg] locateSource error:', err)
        sendResponse({ file: null, line: null, column: null })
      })

    return true  // keep message channel open for async response
  },
)

// ─── Core logic ───────────────────────────────────────────────────────────────

async function locateSource(tabId: number): Promise<LocateSourceResponse> {
  const debuggee: chrome.debugger.Debuggee = { tabId }
  const scriptMap = new Map<string, ScriptInfo>()

  const onEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params: unknown,
  ): void => {
    if (source.tabId !== tabId) return
    if (method !== 'Debugger.scriptParsed') return

    const p = params as {
      scriptId: string
      url: string
      sourceMapURL?: string
    }
    if (p.url) {
      scriptMap.set(p.scriptId, {
        url: p.url,
        sourceMapURL: p.sourceMapURL ?? '',
      })
    }
  }

  try {
    await chrome.debugger.attach(debuggee, '1.3')

    chrome.debugger.onEvent.addListener(onEvent)

    // Enable Debugger domain — triggers scriptParsed replay for all loaded scripts
    await chrome.debugger.sendCommand(debuggee, 'Debugger.enable', {})

    // Give browser time to fire all scriptParsed events
    await sleep(200)

    // Find the marked element in the main world and return its React component function.
    // Content scripts run in an isolated world — window globals set there are NOT visible
    // to Runtime.evaluate (main world). We mark the DOM element with an attribute
    // (DOM is shared across worlds) and walk the React fiber from the main world.
    const evalResult = await chrome.debugger.sendCommand(
      debuggee,
      'Runtime.evaluate',
      {
        expression: `(function() {
          var el = document.querySelector('[data-de-locate="true"]');
          if (!el) return { error: 'element not found' };
          var keys = Object.keys(el);
          var key = keys.find(function(k) {
            return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
          });
          if (!key) return { error: 'no fiber key, checked ' + keys.length + ' keys' };
          var fiber = el[key];
          var depth = 0;
          while (fiber && depth < 50) {
            if (typeof fiber.type === 'function') return fiber.type;
            fiber = fiber.return || null;
            depth++;
          }
          return { error: 'no component function found after ' + depth + ' hops' };
        })()`,
        returnByValue: false,
      },
    ) as EvaluateResult

    if (evalResult.exceptionDetails) {
      const desc = evalResult.exceptionDetails.exception?.description ?? evalResult.exceptionDetails.text
      console.error('[DE bg] Runtime.evaluate exception:', desc)
      return { file: null, line: null, column: null }
    }

    const objectId = evalResult.result?.objectId

    // If result has no objectId it's a plain value (our error sentinel)
    if (!objectId) {
      console.warn('[DE bg] no objectId — sentinel value:', evalResult.result?.value)
      return { file: null, line: null, column: null }
    }

    // Get internal properties (includes [[FunctionLocation]])
    const propsResult = await chrome.debugger.sendCommand(
      debuggee,
      'Runtime.getProperties',
      { objectId, ownProperties: false },
    ) as GetPropertiesResult

    const internalProps = propsResult.internalProperties ?? []

    const fnLocProp = internalProps.find((p) => p.name === '[[FunctionLocation]]')
    // Chrome returns [[FunctionLocation]] with subtype 'internal#location' and
    // the data directly in value.value: { scriptId, lineNumber, columnNumber }
    const loc = fnLocProp?.value?.value

    if (!loc || typeof loc.scriptId !== 'string') {
      console.warn('[DE bg] [[FunctionLocation]] missing or invalid:', JSON.stringify(fnLocProp?.value))
      return { file: null, line: null, column: null }
    }

    const scriptId     = loc.scriptId
    const lineNumber   = loc.lineNumber
    const columnNumber = loc.columnNumber

    if (scriptId == null || lineNumber == null) {
      console.warn('[DE bg] missing scriptId or lineNumber')
      return { file: null, line: null, column: null }
    }

    const scriptInfo = scriptMap.get(scriptId)
    if (!scriptInfo) {
      console.warn('[DE bg] scriptId not in scriptMap (map has', scriptMap.size, 'entries)')
      return { file: null, line: null, column: null }
    }

    // If there's a sourcemap, resolve the original location
    if (scriptInfo.sourceMapURL) {
      const resolved = await fetchAndResolveSourcemap(
        scriptInfo.url,
        scriptInfo.sourceMapURL,
        lineNumber,
        columnNumber ?? 0,
      )
      if (resolved) {
        // Convert file:// URL to plain filesystem path (e.g. file:///Users/... → /Users/...)
        const source = resolved.source.startsWith('file://')
          ? resolved.source.replace(/^file:\/\//, '')
          : resolved.source
        return { file: source, line: resolved.line, column: resolved.column }
      }
    } else {
      console.warn('[DE bg] no sourceMapURL for script:', scriptInfo.url)
    }

    // Fallback: return the raw script URL + line (0-based → 1-based)
    return { file: scriptInfo.url, line: lineNumber + 1, column: columnNumber ?? 0 }
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent)
    chrome.debugger.detach(debuggee).catch(() => { /* ignore detach errors */ })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getPropValue<T>(
  props: Array<{ name: string; value?: { value?: unknown } }>,
  name: string,
): T | undefined {
  const prop = props.find((p) => p.name === name)
  return prop?.value?.value as T | undefined
}
