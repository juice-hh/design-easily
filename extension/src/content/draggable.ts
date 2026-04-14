/**
 * makePanelDraggable — makes a panel draggable by its header.
 *
 * @param dragHandle  Element inside shadow root that initiates drag on mousedown.
 *                    mousedown events bubble out from Shadow DOM to `document` normally.
 * @param panelHost   The light-DOM host element (position:fixed, appended to document.body).
 *                    This is the element whose style.left/top we actually mutate.
 * @returns Cleanup function that removes the mousedown listener.
 */
export function makePanelDraggable(dragHandle: HTMLElement, panelHost: HTMLElement): () => void {
  let startX = 0
  let startY = 0
  let startLeft = 0
  let startTop = 0

  function onMouseDown(e: MouseEvent): void {
    // Don't initiate drag on button/input clicks inside the header
    const target = e.target as HTMLElement
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return

    e.preventDefault()
    startX = e.clientX
    startY = e.clientY

    const rect = panelHost.getBoundingClientRect()
    // Switch from right-anchored (default) to left-anchored so we can set left freely
    panelHost.style.right = 'auto'
    panelHost.style.left = rect.left + 'px'
    panelHost.style.top = rect.top + 'px'
    startLeft = rect.left
    startTop = rect.top

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent): void {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    panelHost.style.left = Math.max(0, startLeft + dx) + 'px'
    panelHost.style.top = Math.max(0, startTop + dy) + 'px'
  }

  function onMouseUp(): void {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  dragHandle.style.cursor = 'grab'
  dragHandle.addEventListener('mousedown', onMouseDown)
  return () => dragHandle.removeEventListener('mousedown', onMouseDown)
}
