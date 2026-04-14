// Source: specs/04-ai-proxy-test-plan.md — Recommended First Batch
// Anthropic SDK is fully mocked — no real API calls.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoist mock data so it's available inside vi.mock factory ──────────────────

const mockIterator = vi.hoisted(() => vi.fn<AsyncGenerator<unknown>>())

// ── Mock Anthropic SDK as a constructable class ───────────────────────────────

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = function (this: Record<string, unknown>) {
    this.messages = {
      stream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: mockIterator,
      }),
    }
  }
  return { default: MockAnthropic }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

type Chunk =
  | { type: 'content_block_delta'; delta: { type: 'text_delta'; text: string } }
  | { type: 'content_block_delta'; delta: { type: 'input_json_delta'; partial_json: string } }
  | { type: 'message_start' | 'message_stop' }

async function* makeStream(...chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const chunk of chunks) yield chunk
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('04 — AI Proxy', () => {
  beforeEach(() => {
    vi.resetModules()
    mockIterator.mockReset()
    // Default: key present. Tests that need absence delete it in-test.
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
  })

  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY']
  })

  it('calls onChunk for each text_delta and onDone at end', async () => {
    mockIterator.mockImplementation(() =>
      makeStream(
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
        { type: 'message_stop' },
      ),
    )

    const { streamAIResponse } = await import('../../server/src/ai.js')

    const chunks: string[] = []
    let done = false

    await streamAIResponse(
      'claude-sonnet-4-6',
      [{ role: 'user', content: 'hi' }],
      {
        onChunk: (t) => chunks.push(t),
        onDone: () => { done = true },
        onError: (e) => { throw e },
      },
    )

    expect(chunks).toEqual(['Hello ', 'world'])
    expect(done).toBe(true)
  })

  it('ignores non-text_delta chunks', async () => {
    mockIterator.mockImplementation(() =>
      makeStream(
        { type: 'message_start' },
        { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'only this' } },
      ),
    )

    const { streamAIResponse } = await import('../../server/src/ai.js')

    const chunks: string[] = []
    await streamAIResponse('claude-sonnet-4-6', [{ role: 'user', content: 'hi' }], {
      onChunk: (t) => chunks.push(t),
      onDone: () => {},
      onError: () => {},
    })

    expect(chunks).toEqual(['only this'])
  })

  it('calls onError when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'] // override the beforeEach default
    const { streamAIResponse } = await import('../../server/src/ai.js')

    let errorMsg = ''
    await streamAIResponse('claude-sonnet-4-6', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })

    expect(errorMsg).toContain('claude-sonnet-4-6')
  })

  it('wraps non-Error throws in a new Error (ai.ts:72)', async () => {
    async function* throwStringStream(): AsyncGenerator<never> {
      throw 'raw string error'
      yield undefined as never
    }
    mockIterator.mockImplementation(throwStringStream)

    const { streamAIResponse } = await import('../../server/src/ai.js')
    let errorMsg = ''
    await streamAIResponse('claude-sonnet-4-6', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })
    expect(errorMsg).toContain('raw string error')
  })

  it('calls onError when SDK stream throws', async () => {
    async function* throwingStream(): AsyncGenerator<never> {
      throw new Error('Stream broken')
      // unreachable yield to satisfy generator type
      yield undefined as never
    }
    mockIterator.mockImplementation(throwingStream)

    const { streamAIResponse } = await import('../../server/src/ai.js')

    let errorMsg = ''
    await streamAIResponse('claude-sonnet-4-6', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })

    expect(errorMsg).toContain('Stream broken')
  })
})
