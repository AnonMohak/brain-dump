import type { StreamEvent } from '@shared/events'
import { createParser } from 'eventsource-parser'
import { ApiError } from './api'

/**
 * POSTs to an SSE endpoint and calls `onEvent` for each event.
 * (EventSource only supports GET, so this reads the fetch body directly.)
 */
export async function postStream(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status)
  }

  const parser = createParser({
    onEvent(event) {
      if (event.event === 'ping') return
      try {
        onEvent(JSON.parse(event.data) as StreamEvent)
      } catch (error) {
        console.error('Bad stream event', error)
      }
    },
  })

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    parser.feed(value)
  }
}
