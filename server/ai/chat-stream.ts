import { createParser } from 'eventsource-parser'

export type ProviderId = 'gemini' | 'openrouter'

export const PROVIDER_NAME: Record<ProviderId, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
}

export class AiError extends Error {
  readonly provider: ProviderId
  readonly status: number | null
  /** True when another try with the same provider can work: rate limits, outages. */
  readonly retryable: boolean

  constructor(provider: ProviderId, message: string, status: number | null, retryable: boolean) {
    super(message)
    this.name = 'AiError'
    this.provider = provider
    this.status = status
    this.retryable = retryable
  }
}

export type StreamChunk =
  | { type: 'model'; model: string }
  | { type: 'reasoning' }
  | { type: 'content'; text: string }
  | { type: 'finish'; reason: string }

export type ChatStreamRequest = {
  provider: ProviderId
  url: string
  apiKey: string
  headers?: Record<string, string>
  /** An OpenAI-style chat completions body. `stream: true` is added. */
  body: Record<string, unknown>
  signal?: AbortSignal
  fetch?: typeof fetch
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    let json = JSON.parse(text)
    // Gemini wraps errors in an array.
    if (Array.isArray(json)) json = json[0]
    const raw = json?.error?.metadata?.raw
    return [json?.error?.message, typeof raw === 'string' ? raw : null].filter(Boolean).join(' - ') || text
  } catch {
    return text || res.statusText
  }
}

/**
 * Streams an OpenAI-compatible chat completion (OpenRouter and Gemini both
 * speak this format) and yields small, typed chunks.
 */
export async function* streamChatCompletion(req: ChatStreamRequest): AsyncGenerator<StreamChunk> {
  const doFetch = req.fetch ?? fetch
  const { provider } = req

  let res: Response
  try {
    res = await doFetch(req.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
        ...req.headers,
      },
      body: JSON.stringify({ ...req.body, stream: true }),
      signal: req.signal,
    })
  } catch (error) {
    if (req.signal?.aborted) throw error
    throw new AiError(provider, `Network error: ${(error as Error).message}`, null, true)
  }

  if (!res.ok || !res.body) {
    throw new AiError(provider, await readErrorMessage(res), res.status, isRetryableStatus(res.status))
  }

  const queue: StreamChunk[] = []
  let streamError: AiError | null = null
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
      if (Array.isArray(json)) json = json[0]
      if (json?.error) {
        const status = typeof json.error.code === 'number' ? json.error.code : null
        streamError = new AiError(provider, json.error.message ?? 'The model failed', status, true)
        return
      }
      if (!modelSeen && typeof json.model === 'string') {
        modelSeen = true
        queue.push({ type: 'model', model: json.model })
      }
      const choice = json.choices?.[0]
      if (!choice) return
      const delta = choice.delta ?? {}
      if (delta.reasoning || delta.reasoning_content || delta.reasoning_details?.length) {
        queue.push({ type: 'reasoning' })
      }
      if (typeof delta.content === 'string' && delta.content) {
        queue.push({ type: 'content', text: delta.content })
      }
      if (choice.finish_reason) queue.push({ type: 'finish', reason: String(choice.finish_reason).toLowerCase() })
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
