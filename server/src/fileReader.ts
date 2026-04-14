/**
 * File reader — reads source code context around a given line.
 * Used to provide AI with relevant code snippet.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CONTEXT_LINES = 20
const MAX_FILE_LINES = 2000

export interface FileContext {
  file: string
  line: number
  snippet: string
  language: string
}

function detectLanguage(file: string): string {
  const ext = file.split('.').pop()!.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    vue: 'vue', svelte: 'svelte', css: 'css', scss: 'scss',
    json: 'json', html: 'html',
  }
  return map[ext] ?? 'text'
}

export interface FullFileContent {
  file: string
  content: string
  language: string
  totalLines: number
  truncated: boolean
}

export async function readFullFile(file: string): Promise<FullFileContent | null> {
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf-8')
    const lines = raw.split('\n')
    const truncated = lines.length > MAX_FILE_LINES
    const content = truncated ? lines.slice(0, MAX_FILE_LINES).join('\n') : raw
    return { file, content, language: detectLanguage(file), totalLines: lines.length, truncated }
  } catch {
    return null
  }
}

export async function readFileContext(
  file: string,
  line: number,
): Promise<FileContext | null> {
  if (!existsSync(file)) return null

  try {
    const content = await readFile(file, 'utf-8')
    const lines = content.split('\n')
    const start = Math.max(0, line - CONTEXT_LINES - 1)
    const end = Math.min(lines.length, line + CONTEXT_LINES)
    const snippet = lines.slice(start, end).join('\n')

    return {
      file,
      line,
      snippet,
      language: detectLanguage(file),
    }
  } catch {
    return null
  }
}
