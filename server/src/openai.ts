/**
 * OpenAI proxy — streams responses from GPT models.
 * Sends chunks back via WebSocket callback.
 */

import OpenAI from 'openai'
import { config } from './config.js'
import { SYSTEM_PROMPT, type ChatMessage, type StreamCallbacks } from './ai.js'

export async function streamOpenAIResponse(
  model: string,
  messages: ChatMessage[],
  { onChunk, onDone, onError }: StreamCallbacks,
): Promise<void> {
  if (!config.openaiApiKey) {
    onError(new Error('OPENAI_API_KEY is not configured. Set the OPENAI_API_KEY environment variable to use the OpenAI provider.'))
    return
  }

  const client = new OpenAI({ apiKey: config.openaiApiKey })

  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        onChunk(delta)
      }
    }

    onDone()
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
