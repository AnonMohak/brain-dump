import { describe, expect, test } from 'bun:test'
import { createParser } from 'eventsource-parser'
import { makeTestApp } from '../test-utils'
import { chunk, errorResponse, fakeFetch, GEMINI, streamResponse, ULTRA } from './fake-openrouter'

const NOW = '2026-10-14T09:00:00Z'
const BOTH = { GEMINI_API_KEY: 'gm-test', OPENROUTER_API_KEY: 'sk-or-test' }

async function postText(app: ReturnType<typeof makeTestApp>, body: Record<string, unknown>) {
  const res = await app.app.request('/api/ai/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now: NOW, timeZone: 'UTC', ...body }),
  })
  const events: any[] = []
  const parser = createParser({ onEvent: (e) => e.event !== 'ping' && events.push(JSON.parse(e.data)) })
  parser.feed(await res.text())
  return { res, events, text: events.filter((e) => e.type === 'text').map((e) => e.delta).join('') }
}

describe('POST /api/ai/text', () => {
  test('plan streams Markdown built from the open items', async () => {
    const answer = 'Start with the overdue rent.\n1. **Pay rent** — do it first, morning.\n'
    const fake = fakeFetch(() => streamResponse(chunk(answer), { model: GEMINI, reasoning: false }))
    const app = makeTestApp({ env: BOTH, fetch: fake.fetch })
    await app.call('POST', '/api/items', { type: 'reminder', title: 'Pay rent', priority: 'high', dueDate: '2026-10-13' })
    const done = await app.call('POST', '/api/items', { type: 'task', title: 'Old finished thing' })
    await app.call('PATCH', `/api/items/${done.data.id}`, { status: 'done' })

    const { events, text } = await postText(app, { mode: 'plan' })
    expect(text).toBe(answer)
    expect(events[0]).toEqual({ type: 'status', model: GEMINI })
    expect(events.at(-1)).toEqual({ type: 'done', model: GEMINI })

    const prompt = fake.calls[0].messages
    expect(prompt[0].content).toContain('Make a realistic plan')
    expect(prompt[1].content).toContain('- Pay rent (reminder, high, due 2026-10-13)')
    expect(prompt[1].content).not.toContain('Old finished thing')
  })

  test('falls back to the next model before any text arrives', async () => {
    const fake = fakeFetch(
      () => errorResponse(503, 'This model is currently experiencing high demand.'),
      () => streamResponse(['All clear today.']),
    )
    const app = makeTestApp({ env: BOTH, fetch: fake.fetch })
    const { events, text } = await postText(app, { mode: 'plan' })
    expect(text).toBe('All clear today.')
    expect(events.filter((e) => e.type === 'status').map((e) => e.model)).toEqual([GEMINI, ULTRA])
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  test('without keys it reports the setup problem', async () => {
    const { events } = await postText(makeTestApp(), { mode: 'plan' })
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('GEMINI_API_KEY') }])
  })

  test('ask needs a question', async () => {
    const app = makeTestApp({ env: BOTH })
    const res = await app.call('POST', '/api/ai/text', { mode: 'ask', now: NOW, timeZone: 'UTC' })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('question')
  })
})
