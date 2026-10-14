import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { aiTextInputSchema } from '../../shared/schemas'
import { streamText, type TextDeps } from '../ai/text'
import { validate } from '../validate'

const PING_MS = 15_000

export function aiRoutes(deps: TextDeps) {
  return new Hono().post('/text', validate('json', aiTextInputSchema), (c) => {
    const input = c.req.valid('json')
    return streamSSE(c, async (stream) => {
      const controller = new AbortController()
      stream.onAbort(() => controller.abort())
      const ping = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {})
      }, PING_MS)
      try {
        for await (const event of streamText(deps, { ...input, signal: controller.signal })) {
          if (stream.aborted) break
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
        }
      } finally {
        clearInterval(ping)
      }
    })
  })
}
