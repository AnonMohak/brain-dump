// A fake OpenRouter for tests. It answers with the same SSE format as the real API.

export const ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free'
export const SUPER = 'nvidia/nemotron-3-super-120b-a12b:free'

const encoder = new TextEncoder()

function sse(data: unknown): string {
  return `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`
}

/** A streamed answer: some reasoning, then the content in the given pieces. */
export function streamResponse(
  pieces: string[],
  opts: { model?: string; finishReason?: string; reasoning?: boolean; error?: string } = {},
): Response {
  const model = opts.model ?? ULTRA
  const events = [': OPENROUTER PROCESSING\n\n', sse({ model, choices: [{ delta: { role: 'assistant', content: '' } }] })]
  if (opts.reasoning !== false) {
    events.push(sse({ model, choices: [{ delta: { reasoning: 'Let me sort this out.' } }] }))
  }
  for (const piece of pieces) events.push(sse({ model, choices: [{ delta: { content: piece } }] }))
  if (opts.error) {
    events.push(sse({ model, error: { code: 502, message: opts.error }, choices: [{ delta: {}, finish_reason: 'error' }] }))
  } else {
    events.push(sse({ model, choices: [{ delta: {}, finish_reason: opts.finishReason ?? 'stop' }] }))
    events.push(sse('[DONE]'))
  }
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

/** An answer that never sends anything, until the request is aborted. */
export function silentResponse(signal: AbortSignal | null | undefined): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
      },
    }),
  )
}

export function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Handler = (body: any, init: RequestInit) => Response | Promise<Response>

/** A fetch that answers each call with the next handler and records the request bodies. */
export function fakeFetch(...handlers: Handler[]) {
  const calls: any[] = []
  const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push(body)
    const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)]
    if (!handler) throw new Error('fakeFetch: no handler')
    return handler(body, init ?? {})
  }) as typeof fetch
  return { fetch: fn, calls }
}

/** Splits text into small pieces, like a real token stream. */
export function chunk(text: string, size = 7): string[] {
  const pieces: string[] = []
  for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size))
  return pieces
}

export const GOOD_ANSWER = [
  '{"kind":"meta","title":"Dentist and rent","summary":"A sore tooth and rent."}',
  '{"kind":"item","type":"task","title":"Call the dentist","details":null,"priority":"high","due":null,"tags":["Health"],"quote":"call the dentist","subtasks":["Find the number","Book a slot"]}',
  '{"kind":"item","type":"reminder","title":"Pay the rent","details":null,"priority":"high","due":{"date":"2026-11-01","time":null,"source":"stated"},"tags":["money"],"quote":"rent on the 1st","subtasks":[]}',
  '{"kind":"item","type":"idea","title":"Start a podcast","details":null,"priority":"low","due":{"date":"2026-10-20","time":null,"source":"suggested"},"tags":[],"quote":"invented words","subtasks":[]}',
].join('\n')

export const GOOD_DUMP = 'tooth hurts, call the dentist. rent on the 1st. podcast maybe'
