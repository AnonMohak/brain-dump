import { createParser } from 'eventsource-parser'
import type { ChatMessage } from './prompt'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export class OpenRouterError extends Error {
  readonly status: number | null
  /** True when another try (or another model) can work: rate limits, outages, timeouts. */
  readonly retryable: boolean

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
    this.retryable = retryable
  }
}

export type StreamChunk =
  | { type: 'model'; model: string }
  | { type: 'reasoning' }
  | { type: 'content'; text: string }
  | { type: 'finish'; reason: string }

export type ChatRequest = {
  apiKey: string
  /** The first model is the main one. OpenRouter tries the next ones when it fails. */
  models: string[]
  messages: ChatMessage[]
  /** "none" turns reasoning off: much faster, slightly less careful. */
  reasoningEffort: 'none' | 'low' | 'medium' | 'high'
  maxTokens?: number
  signal?: AbortSignal
  fetch?: typeof fetch
  /** Extra request fields, for experiments such as tool calls (scripts/ai-smoke.ts). */
  extraBody?: Record<string, unknown>
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const json = JSON.parse(text)
    const raw = json?.error?.metadata?.raw
    return [json?.error?.message, typeof raw === 'string' ? raw : null].filter(Boolean).join(' - ') || text
  } catch {
    return text || res.statusText
  }
}

/** Streams a chat completion from OpenRouter and yields small, typed chunks. */
export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamChunk> {
  const doFetch = req.fetch ?? fetch
  const [model, ...fallbacks] = req.models
  const body = {
    model,
    ...(fallbacks.length ? { models: req.models } : {}),
    messages: req.messages,
    stream: true,
    temperature: 0.2,
    max_tokens: req.maxTokens ?? 24_000,
    reasoning: req.reasoningEffort === 'none' ? { enabled: false } : { effort: req.reasoningEffort },
    ...req.extraBody,
  }

  let res: Response
  try {
    res = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost/sift',
        'X-Title': 'Sift',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    })
  } catch (error) {
    if (req.signal?.aborted) throw error
    throw new OpenRouterError(`Network error: ${(error as Error).message}`, null, true)
  }

  if (!res.ok || !res.body) {
    throw new OpenRouterError(await readErrorMessage(res), res.status, isRetryableStatus(res.status))
  }

  const queue: StreamChunk[] = []
  let streamError: OpenRouterError | null = null
  let modelSeen = false

  const parser = createParser({
    onEvent(event) {
      if (event.data === '[DONE]') return
      let json: any
      try {
        json = JSON.parse(event.data)
      } catch {
        return
      }
      if (json.error) {
        const status = typeof json.error.code === 'number' ? json.error.code : null
        streamError = new OpenRouterError(json.error.message ?? 'The model failed', status, true)
        return
      }
      if (!modelSeen && typeof json.model === 'string') {
        modelSeen = true
        queue.push({ type: 'model', model: json.model })
      }
      const choice = json.choices?.[0]
      if (!choice) return
      const delta = choice.delta ?? {}
      if (delta.reasoning || delta.reasoning_details?.length) queue.push({ type: 'reasoning' })
      if (typeof delta.content === 'string' && delta.content) {
        queue.push({ type: 'content', text: delta.content })
      }
      for (const call of delta.tool_calls ?? []) {
        const args = call?.function?.arguments
        if (typeof args === 'string' && args) queue.push({ type: 'content', text: args })
      }
      if (choice.finish_reason) queue.push({ type: 'finish', reason: choice.finish_reason })
    },
  })

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      parser.feed(value)
      while (queue.length) yield queue.shift()!
      if (streamError) throw streamError
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
