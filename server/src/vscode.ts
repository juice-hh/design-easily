/**
 * VS Code integration — opens a file at a specific line using the `code` CLI.
 */

import { exec } from 'node:child_process'

export function openInVSCode(file: string, line: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // `code --goto file:line` is the standard way to open at a specific line
    const cmd = `code --goto "${file}:${line}"`
    exec(cmd, (err) => {
      if (err) {
        reject(new Error(`Failed to open VS Code: ${err.message}`))
      } else {
        resolve()
      }
    })
  })
}
