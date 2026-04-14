/**
 * AI proxy — streams responses from Claude or OpenAI.
 * Sends chunks back via WebSocket callback.
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from './config.js'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

export const SYSTEM_PROMPT = `你是一个专业的前端开发助手，专注于帮助用户修改和优化 UI 组件。
当用户提供元素上下文和修改需求时：
1. 直接给出具体的代码修改建议
2. 说明修改哪个文件的哪个位置
3. 如果涉及样式，优先使用现有的 CSS 变量/类名
4. 代码简洁，不要过度解释
5. 使用中文回复`

export async function streamAIResponse(
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const isAnthropic =
    model.startsWith('claude-') && !!config.anthropicApiKey

  if (isAnthropic) {
    await streamAnthropic(model, messages, callbacks)
  } else {
    callbacks.onError(new Error('No valid API key found for model: ' + model))
  }
}

async function streamAnthropic(
  model: string,
  messages: ChatMessage[],
  { onChunk, onDone, onError }: StreamCallbacks,
): Promise<void> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        onChunk(chunk.delta.text)
      }
    }

    onDone()
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
