/**
 * VS Code integration for inspect mode.
 * Opens a file at a given line via the vscode:// protocol.
 */

export function openInVSCode(file: string, line: number): void {
  const a = document.createElement('a')
  a.href = `vscode://file${file}:${line}`
  document.body.appendChild(a)
  a.click()
  a.remove()
}
