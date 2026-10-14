import { describe, expect, test } from 'bun:test'
import { createParser } from 'eventsource-parser'
import { openDb } from '../db/client'
import { createDump, getDump, listItems } from '../db/repo'
import { loadEnv } from '../env'
import { makeTestApp } from '../test-utils'
import {
  chunk,
  errorResponse,
  fakeFetch,
  GOOD_ANSWER,
  GOOD_DUMP,
  silentResponse,
  streamResponse,
  SUPER,
  GEMINI,
  ULTRA,
} from './fake-openrouter'
import { organizeDump, type OrganizeEvent } from './organize'

const NOW = '2026-10-14T09:00:00Z'
const KEY_ENV = { OPENROUTER_API_KEY: 'sk-or-test' }

/** Posts a dump and collects the SSE events of the answer. */
async function postDump(app: ReturnType<typeof makeTestApp>, text = GOOD_DUMP) {
  const res = await app.app.request('/api/dumps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, now: NOW, timeZone: 'UTC' }),
  })
  return { res, events: await readEvents(res) }
}

async function readEvents(res: Response): Promise<any[]> {
  const events: any[] = []
  const parser = createParser({
    onEvent: (event) => {
      if (event.event !== 'ping') events.push(JSON.parse(event.data))
    },
  })
  parser.feed(await res.text())
  return events
}

describe('POST /api/dumps', () => {
  test('streams and saves items, with the product rules applied', async () => {
    const fake = fakeFetch(() => streamResponse(chunk(GOOD_ANSWER)))
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { res, events } = await postDump(app)

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(events.map((e) => e.type)).toEqual([
      'dump',
      'status',
      'status',
      'meta',
      'item',
      'item',
      'item',
      'done',
    ])
    expect(events[1]).toMatchObject({ phase: 'thinking' })
    expect(events[2]).toMatchObject({ phase: 'writing', model: ULTRA })

    const [task, reminder, idea] = events.filter((e) => e.type === 'item').map((e) => e.item)
    expect(task).toMatchObject({
      type: 'task',
      priority: 'high',
      dueDate: '2026-10-15', // suggested: high priority = tomorrow
      dueSource: 'suggested',
      tags: ['health'],
      sourceQuote: 'call the dentist',
    })
    expect(task.subtasks.map((s: any) => s.text)).toEqual(['Find the number', 'Book a slot'])
    expect(reminder).toMatchObject({ dueDate: '2026-11-01', dueSource: 'stated' })
    expect(idea).toMatchObject({ dueDate: null, sourceQuote: null }) // suggested date and invented quote dropped
    expect(task.position).toBeLessThan(reminder.position)

    const done = events.at(-1)
    expect(done.dump).toMatchObject({
      status: 'done',
      title: 'Dentist and rent',
      summary: 'A sore tooth and rent.',
      modelUsed: ULTRA,
      itemCount: 3,
    })

    // The request to OpenRouter
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]).toMatchObject({
      model: ULTRA,
      models: [ULTRA, SUPER],
      stream: true,
      reasoning: { enabled: false },
    })
    expect(fake.calls[0].messages[1].content).toContain('Today: Wednesday 2026-10-14, 09:00 (UTC)')
    expect(fake.calls[0].messages[1].content).toContain(GOOD_DUMP)
  })

  test('rejects an empty dump', async () => {
    const app = makeTestApp({ env: KEY_ENV })
    const res = await app.call('POST', '/api/dumps', { text: '   ', now: NOW, timeZone: 'UTC' })
    expect(res.status).toBe(400)
  })

  test('without an API key it fails fast with a clear message', async () => {
    const fake = fakeFetch(() => streamResponse([]))
    const app = makeTestApp({ fetch: fake.fetch })
    const { events } = await postDump(app)
    expect(events.at(-1)).toMatchObject({ type: 'error', dump: { status: 'failed' } })
    expect(events.at(-1).message).toContain('OPENROUTER_API_KEY')
    expect(fake.calls).toHaveLength(0)
  })

  test('tries the fallback model when the answer has no readable items', async () => {
    const fake = fakeFetch(
      () => streamResponse(['Sorry, I cannot do that.']),
      () => streamResponse(chunk(GOOD_ANSWER), { model: SUPER }),
    )
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { events } = await postDump(app)

    expect(fake.calls.map((c) => c.models ?? [c.model])).toEqual([[ULTRA, SUPER], [SUPER]])
    expect(events.some((e) => e.type === 'warning' && e.message.includes(`Trying ${SUPER} instead`))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', dump: { modelUsed: SUPER, itemCount: 3 } })
  })

  test('reports a rate limit after both attempts fail', async () => {
    const fake = fakeFetch(() => errorResponse(429, 'Rate limit exceeded: free-models-per-day'))
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { events } = await postDump(app)

    expect(fake.calls).toHaveLength(2)
    const last = events.at(-1)
    expect(last).toMatchObject({ type: 'error', dump: { status: 'failed' } })
    expect(last.message).toContain('429')
  })

  test('does not retry a rejected API key', async () => {
    const fake = fakeFetch(() => errorResponse(401, 'User not found.'))
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { events } = await postDump(app)
    expect(fake.calls).toHaveLength(1)
    expect(events.at(-1).message).toContain('rejected the API key')
  })

  test('explains a privacy-settings mismatch', async () => {
    const fake = fakeFetch(() => errorResponse(404, 'No endpoints found matching your data policy'))
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { events } = await postDump(app)
    expect(events.at(-1).message).toContain('openrouter.ai/settings/privacy')
  })

  test('times out a silent model and tries the fallback', async () => {
    const fake = fakeFetch((_body, init) => silentResponse(init.signal))
    const app = makeTestApp({
      env: KEY_ENV,
      fetch: fake.fetch,
      aiTimeouts: { firstChunkMs: 30, idleMs: 30, totalMs: 1000 },
    })
    const { events } = await postDump(app)
    expect(fake.calls).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({ type: 'error', message: `${SUPER} did not answer in time.` })
  })

  test('keeps the items that arrived before a mid-stream error', async () => {
    const firstTwoLines = GOOD_ANSWER.split('\n').slice(0, 2).join('\n') + '\n'
    const fake = fakeFetch(() => streamResponse(chunk(firstTwoLines), { error: 'Provider crashed' }))
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { events } = await postDump(app)

    expect(fake.calls).toHaveLength(1)
    expect(events.filter((e) => e.type === 'item')).toHaveLength(1)
    expect(events.some((e) => e.type === 'warning' && e.message.includes('were kept'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', dump: { status: 'done', itemCount: 1 } })
  })

  test('warns when the answer is cut off or has unreadable parts', async () => {
    const answer = GOOD_ANSWER + '\n{"kind":"item","type":"chore","title":"x"}\n{"kind":"item","ti'
    const fake = fakeFetch(() => streamResponse(chunk(answer), { finishReason: 'length' }))
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const { events } = await postDump(app)
    const warnings = events.filter((e) => e.type === 'warning').map((e) => e.message)
    expect(warnings.some((m) => m.includes('cut off'))).toBe(true)
    expect(warnings.some((m) => m.startsWith('2 parts'))).toBe(true)
    expect(events.at(-1).type).toBe('done')
  })
})

describe('POST /api/dumps/:id/rerun', () => {
  test('replaces the items of the dump', async () => {
    const fake = fakeFetch(
      () => streamResponse(chunk(GOOD_ANSWER)),
      () =>
        streamResponse([
          '{"kind":"meta","title":"Second try","summary":"Only one thing."}\n',
          '{"kind":"item","type":"task","title":"Call the dentist today","priority":"high"}\n',
        ]),
    )
    const app = makeTestApp({ env: KEY_ENV, fetch: fake.fetch })
    const first = await postDump(app)
    const dumpId = first.events[0].dump.id
    expect(listItems(app.db)).toHaveLength(3)

    const res = await app.app.request(`/api/dumps/${dumpId}/rerun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ now: NOW, timeZone: 'UTC' }),
    })
    const events = await readEvents(res)
    expect(events.at(-1)).toMatchObject({ type: 'done', dump: { title: 'Second try', itemCount: 1 } })
    expect(listItems(app.db).map((i) => i.title)).toEqual(['Call the dentist today'])
    // The dump text is sent again.
    expect(fake.calls[1].messages[1].content).toContain(GOOD_DUMP)
  })

  test('returns 404 for an unknown dump', async () => {
    const app = makeTestApp({ env: KEY_ENV })
    const res = await app.call('POST', '/api/dumps/nope/rerun', { now: NOW, timeZone: 'UTC' })
    expect(res.status).toBe(404)
  })
})

describe('organizeDump cancel', () => {
  test('a cancel keeps the saved items and marks the dump', async () => {
    const db = openDb(':memory:')
    const env = loadEnv({ NODE_ENV: 'test', ...KEY_ENV })
    const dump = createDump(db, GOOD_DUMP)
    const controller = new AbortController()

    // One item, then silence until the request is aborted.
    const firstLine = GOOD_ANSWER.split('\n').slice(0, 2).join('\n') + '\n'
    const fake = fakeFetch((_body, init) => {
      const encoder = new TextEncoder()
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(`data: ${JSON.stringify({ model: ULTRA, choices: [{ delta: { content: firstLine } }] })}\n\n`))
            init.signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')))
          },
        }),
      )
    })

    const events: OrganizeEvent[] = []
    for await (const event of organizeDump(
      { db, env, fetch: fake.fetch },
      { dumpId: dump.id, text: GOOD_DUMP, now: NOW, timeZone: 'UTC', signal: controller.signal },
    )) {
      events.push(event)
      if (event.type === 'item') controller.abort()
    }

    expect(events.filter((e) => e.type === 'item')).toHaveLength(1)
    expect(fake.calls).toHaveLength(1)
    expect(getDump(db, dump.id)).toMatchObject({ status: 'cancelled', itemCount: 1 })
  })

  test('a consumer that stops early never leaves the dump in "processing"', async () => {
    const db = openDb(':memory:')
    const env = loadEnv({ NODE_ENV: 'test', ...KEY_ENV })
    const dump = createDump(db, GOOD_DUMP)
    const fake = fakeFetch(() => streamResponse(chunk(GOOD_ANSWER)))

    for await (const event of organizeDump(
      { db, env, fetch: fake.fetch },
      { dumpId: dump.id, text: GOOD_DUMP, now: NOW, timeZone: 'UTC', signal: new AbortController().signal },
    )) {
      if (event.type === 'item') break
    }
    expect(getDump(db, dump.id)?.status).toBe('done')
  })
})

describe('Gemini first, Nemotron as fallback', () => {
  const BOTH = { GEMINI_API_KEY: 'gm-test', OPENROUTER_API_KEY: 'sk-or-test' }

  test('uses Gemini when its key is set', async () => {
    const fake = fakeFetch(() => streamResponse(chunk(GOOD_ANSWER), { model: GEMINI, reasoning: false }))
    const app = makeTestApp({ env: BOTH, fetch: fake.fetch })
    const { events } = await postDump(app)

    expect(fake.urls).toEqual(['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'])
    expect(fake.calls[0]).toMatchObject({ model: GEMINI, stream: true, reasoning_effort: 'low' })
    expect(fake.calls[0].models).toBeUndefined()
    expect(fake.calls[0].reasoning).toBeUndefined()
    expect(events[1]).toMatchObject({ type: 'status', phase: 'thinking', model: GEMINI })
    expect(events.at(-1)).toMatchObject({ type: 'done', dump: { modelUsed: GEMINI, itemCount: 3 } })
  })

  test('falls back to OpenRouter when Gemini hits its limit', async () => {
    const fake = fakeFetch(
      () => errorResponse(429, 'Resource has been exhausted (e.g. check quota).'),
      () => streamResponse(chunk(GOOD_ANSWER)),
    )
    const app = makeTestApp({ env: BOTH, fetch: fake.fetch })
    const { events } = await postDump(app)

    expect(fake.urls.map((u) => new URL(u).host)).toEqual(['generativelanguage.googleapis.com', 'openrouter.ai'])
    expect(fake.calls[1]).toMatchObject({ model: ULTRA, models: [ULTRA, SUPER] })
    const warning = events.find((e) => e.type === 'warning')
    expect(warning.message).toContain(`${GEMINI} is busy, or its free limit is used up (Gemini 429).`)
    expect(warning.message).toContain(`Trying ${ULTRA} instead`)
    expect(events.at(-1)).toMatchObject({ type: 'done', dump: { modelUsed: ULTRA } })
  })

  test('a bad Gemini key (Gemini answers 400) still falls back, with a clear message', async () => {
    const fake = fakeFetch(
      () =>
        new Response(JSON.stringify([{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }]), {
          status: 400,
        }),
      () => streamResponse(chunk(GOOD_ANSWER)),
    )
    const app = makeTestApp({ env: BOTH, fetch: fake.fetch })
    const { events } = await postDump(app)
    expect(events.find((e) => e.type === 'warning').message).toContain('Gemini rejected the API key. Check GEMINI_API_KEY')
    expect(events.at(-1).type).toBe('done')
  })

  test('with only a Gemini key there is no OpenRouter fallback', async () => {
    const fake = fakeFetch(() => errorResponse(503, 'The model is overloaded.'))
    const app = makeTestApp({ env: { GEMINI_API_KEY: 'gm-test' }, fetch: fake.fetch })
    const { events } = await postDump(app)
    expect(fake.calls).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'error', dump: { status: 'failed' } })
    expect(events.at(-1).message).toContain('Gemini error 503')
  })

  test('health lists the provider order', async () => {
    const app = makeTestApp({ env: BOTH })
    const res = await app.call('GET', '/api/health')
    expect(res.data).toMatchObject({ aiConfigured: true, model: GEMINI, models: [GEMINI, ULTRA, SUPER] })
  })
})
