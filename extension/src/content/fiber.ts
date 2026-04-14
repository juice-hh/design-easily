/**
 * React fiber source location extractor.
 * Reads internal React fiber properties to extract component name and source file/line.
 * Works in React dev mode (development build) without any extra plugins.
 */

export interface FiberInfo {
  componentName: string | null
  sourceFile: string | null
  sourceLine: number | null
  props: Record<string, unknown>
  componentFn: ((...args: unknown[]) => unknown) | null
}

/**
 * Find the React fiber key on a DOM element.
 * React 16+ stores fiber as __reactFiber$<randomKey> or __reactInternalInstance$<key>
 */
function getFiberKey(el: Element): string | null {
  return (
    Object.keys(el).find(
      (k) =>
        k.startsWith('__reactFiber$') ||
        k.startsWith('__reactInternalInstance$'),
    ) ?? null
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fiber = Record<string, any>

function getFiber(el: Element): Fiber | null {
  const key = getFiberKey(el)
  if (!key) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (el as any)[key] as Fiber
}

/**
 * Walk up the fiber tree to find the nearest user-defined component.
 * Prefers fibers with _debugSource (user code compiled with JSX source plugin)
 * over bare function components (which may be 3rd-party library internals).
 */
function getNearestComponentFiber(fiber: Fiber): Fiber | null {
  let current: Fiber | null = fiber
  let firstFunctionFiber: Fiber | null = null

  while (current) {
    // User-authored component: has source location → return immediately
    if (current._debugSource) return current
    // Function/class component without source: remember as fallback, keep walking up
    if (typeof current.type === 'function' && !firstFunctionFiber) {
      firstFunctionFiber = current
    }
    current = current.return ?? null
  }

  return firstFunctionFiber
}

/**
 * Extract component name from fiber.
 */
function getComponentName(fiber: Fiber): string | null {
  const type = fiber.type
  if (!type) return null
  if (typeof type === 'string') return type
  if (typeof type === 'function') {
    return type.displayName ?? type.name ?? null
  }
  if (type.$$typeof) {
    // forwardRef, memo, etc.
    const inner = type.render ?? type.type
    if (inner) return inner.displayName ?? inner.name ?? null
  }
  return null
}

/**
 * Get source location from fiber._debugSource (injected by react-jsx-dev-runtime in dev).
 */
function getDebugSource(fiber: Fiber): { file: string; line: number } | null {
  const src = fiber._debugSource
  if (src?.fileName && src?.lineNumber) {
    return { file: src.fileName as string, line: src.lineNumber as number }
  }
  return null
}

/**
 * Get visible props (skip internal React props and functions).
 */
function getVisibleProps(fiber: Fiber): Record<string, unknown> {
  const props = fiber.memoizedProps ?? fiber.pendingProps ?? {}
  const visible: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children') continue
    if (typeof v === 'function') continue
    if (k.startsWith('__')) continue
    visible[k] = v
  }
  return visible
}

/**
 * Main API: extract React component info from a DOM element.
 */
export function extractFiberInfo(el: Element): FiberInfo {
  const fiber = getFiber(el)
  if (!fiber) {
    return { componentName: null, sourceFile: null, sourceLine: null, props: {}, componentFn: null }
  }

  const componentFiber = getNearestComponentFiber(fiber)
  if (!componentFiber) {
    return { componentName: null, sourceFile: null, sourceLine: null, props: {}, componentFn: null }
  }

  const componentName = getComponentName(componentFiber)
  const src = getDebugSource(componentFiber)
  const componentFn = typeof componentFiber.type === 'function'
    ? (componentFiber.type as (...args: unknown[]) => unknown)
    : null

  return {
    componentName,
    sourceFile: src?.file ?? null,
    sourceLine: src?.line ?? null,
    props: getVisibleProps(componentFiber),
    componentFn,
  }
}

// ─── Degraded location info (fallback when _debugSource unavailable) ──────────

export interface DegradedInfo {
  domPath: string
  dataTestId: string | null
  route: string
}

function buildDomPath(el: Element, maxDepth = 4): string {
  const parts: string[] = []
  let cur: Element | null = el
  let depth = 0
  while (cur && cur !== document.body && depth < maxDepth) {
    const tag = cur.tagName.toLowerCase()
    const id = cur.id ? `#${cur.id}` : ''
    const cls = cur.classList[0] ? `.${cur.classList[0]}` : ''
    parts.unshift(tag + (id || cls))
    cur = cur.parentElement
    depth++
  }
  return parts.join(' > ')
}

export function getDegradedInfo(el: Element): DegradedInfo {
  return {
    domPath: buildDomPath(el),
    dataTestId: el.getAttribute('data-testid'),
    route: window.location.pathname,
  }
}

/**
 * Build ancestor component chain (breadcrumb).
 * Returns up to 5 nearest component names, from el outward.
 */
export function getComponentBreadcrumb(el: Element): string[] {
  const fiber = getFiber(el)
  if (!fiber) return []

  const chain: string[] = []
  let current: Fiber | null = fiber

  while (current && chain.length < 5) {
    if (typeof current.type === 'function') {
      const name = getComponentName(current)
      if (name && !chain.includes(name)) {
        chain.push(name)
      }
    }
    current = current.return ?? null
  }

  return chain
}
