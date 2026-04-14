/**
 * Server configuration — reads from environment variables with sensible defaults.
 * Create a .env file in the server/ directory to override.
 */

export type AIProvider = 'claude' | 'openai'

export interface Config {
  port: number
  aiProvider: AIProvider
  anthropicApiKey: string | undefined
  openaiApiKey: string | undefined
  defaultModel: string
  openaiDefaultModel: string
  allowedOrigins: string[]
  /** Target project root used when element has no sourceFile (SWC / production builds). */
  workspacePath: string | undefined
}

export const config: Config = {
  port: parseInt(process.env['PORT'] ?? '3771', 10),
  aiProvider: (process.env['AI_PROVIDER'] as AIProvider | undefined) ?? 'claude',
  anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
  openaiApiKey: process.env['OPENAI_API_KEY'],
  defaultModel: process.env['DEFAULT_MODEL'] ?? 'claude-sonnet-4-6',
  openaiDefaultModel: process.env['OPENAI_DEFAULT_MODEL'] ?? 'gpt-4o',
  allowedOrigins: ['*'], // Local tool, allow all origins
  workspacePath: process.env['WORKSPACE_PATH'],
}
