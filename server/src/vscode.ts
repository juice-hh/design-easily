/**
 * VS Code integration — opens a file at a specific line using the `code` CLI.
 */

import { execFile } from 'node:child_process'
import { isAbsolute, normalize } from 'node:path'

export function openInVSCode(file: string, line: number): Promise<void> {
  if (!file || !isAbsolute(file) || file !== normalize(file)) {
    return Promise.reject(new Error('Invalid file path'))
  }
  const target = `${file}:${line}`
  return new Promise((resolve, reject) => {
    execFile('code', ['--goto', target], (err) => {
      if (err) {
        reject(new Error(`Failed to open VS Code: ${err.message}`))
      } else {
        resolve()
      }
    })
  })
}
