// Source: specs/04-ai-proxy-test-plan.md — OpenAI provider variant
// OpenAI SDK is fully mocked — no real API calls.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoist mock data ───────────────────────────────────────────────────────────

const mockCreateStream = vi.hoisted(() => vi.fn())

// ── Mock OpenAI SDK as a constructable class ──────────────────────────────────

vi.mock('openai', () => {
  const MockOpenAI = function (this: Record<string, unknown>) {
    this.chat = {
      completions: {
        create: mockCreateStream,
      },
    }
  }
  return { default: MockOpenAI }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

type Chunk = { choices: Array<{ delta: { content?: string } }> }

async function* makeStream(...chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const chunk of chunks) yield chunk
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('07 — OpenAI Proxy', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreateStream.mockReset()
    process.env['OPENAI_API_KEY'] = 'sk-test-openai'
  })

  afterEach(() => {
    delete process.env['OPENAI_API_KEY']
  })

  it('calls onChunk for each delta content and onDone at end', async () => {
    mockCreateStream.mockResolvedValue(
      makeStream(
        { choices: [{ delta: { content: 'Hello ' } }] },
        { choices: [{ delta: { content: 'world' } }] },
        { choices: [{ delta: {} }] },
      ),
    )

    const { streamOpenAIResponse } = await import('../../server/src/openai.js')

    const chunks: string[] = []
    let done = false

    await streamOpenAIResponse(
      'gpt-4o',
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

  it('skips chunks with empty or missing delta content', async () => {
    mockCreateStream.mockResolvedValue(
      makeStream(
        { choices: [{ delta: {} }] },
        { choices: [{ delta: { content: 'only this' } }] },
        { choices: [] },
      ),
    )

    const { streamOpenAIResponse } = await import('../../server/src/openai.js')

    const chunks: string[] = []
    await streamOpenAIResponse('gpt-4o', [{ role: 'user', content: 'hi' }], {
      onChunk: (t) => chunks.push(t),
      onDone: () => {},
      onError: () => {},
    })

    expect(chunks).toEqual(['only this'])
  })

  it('calls onError when OPENAI_API_KEY is missing', async () => {
    delete process.env['OPENAI_API_KEY']
    const { streamOpenAIResponse } = await import('../../server/src/openai.js')

    let errorMsg = ''
    await streamOpenAIResponse('gpt-4o', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })

    expect(errorMsg).toContain('OPENAI_API_KEY')
  })

  it('calls onError when SDK stream throws', async () => {
    async function* throwingStream(): AsyncGenerator<never> {
      throw new Error('OpenAI stream broken')
      yield undefined as never
    }
    mockCreateStream.mockResolvedValue(throwingStream())

    const { streamOpenAIResponse } = await import('../../server/src/openai.js')

    let errorMsg = ''
    await streamOpenAIResponse('gpt-4o', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })

    expect(errorMsg).toContain('OpenAI stream broken')
  })

  it('wraps non-Error throws in a new Error (openai.ts:44)', async () => {
    async function* throwNonErrorStream(): AsyncGenerator<never> {
      throw 'network failure string'
      yield undefined as never
    }
    mockCreateStream.mockResolvedValue(throwNonErrorStream())

    const { streamOpenAIResponse } = await import('../../server/src/openai.js')
    let errorMsg = ''
    await streamOpenAIResponse('gpt-4o', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })
    expect(errorMsg).toContain('network failure string')
  })

  it('calls onError when SDK create() itself rejects', async () => {
    mockCreateStream.mockRejectedValue(new Error('network error'))

    const { streamOpenAIResponse } = await import('../../server/src/openai.js')

    let errorMsg = ''
    await streamOpenAIResponse('gpt-4o', [{ role: 'user', content: 'hi' }], {
      onChunk: () => {},
      onDone: () => {},
      onError: (e) => { errorMsg = e.message },
    })

    expect(errorMsg).toContain('network error')
  })
})
