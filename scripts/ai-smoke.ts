/**
 * Live AI smoke test. It needs OPENROUTER_API_KEY in .env and uses real requests.
 *
 *   bun run ai:smoke                    JSON Lines method (the app's method)
 *   bun run ai:smoke --mode=tools       forced tool call method, for comparison
 *   bun run ai:smoke --mode=both
 *   bun run ai:smoke --only=dates       one sample dump
 *
 * Each dump uses one or two requests. Free models allow 20 requests per minute
 * and 50 per day (1000 per day after 10 bought credits).
 */
import { z } from 'zod'
import { localNow } from '../shared/dates'
import { DUE_SOURCES, ITEM_TYPES, PRIORITIES } from '../shared/schemas'
import { normalizeItem, parseAiObject } from '../server/ai/normalize'
import { streamChat } from '../server/ai/openrouter'
import { organizeDump } from '../server/ai/organize'
import { buildMessages, SYSTEM_PROMPT } from '../server/ai/prompt'
import { openDb } from '../server/db/client'
import { createDump } from '../server/db/repo'
import { loadEnv } from '../server/env'
import { SMOKE_DUMPS } from './fixtures/dumps'

type Result = {
  name: string
  mode: 'ndjson' | 'tools'
  ok: boolean
  items: number
  skipped: number
  firstItemMs: number | null
  totalMs: number
  model: string | null
  note: string
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=')
    return [key, value ?? 'true']
  }),
)
const mode = (args.mode ?? 'ndjson') as 'ndjson' | 'tools' | 'both'
const dumps = SMOKE_DUMPS.filter((d) => !args.only || d.name === args.only)

const env = loadEnv()
if (!env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY is empty. Add it to .env first.')
  process.exit(1)
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`

function printItem(item: {
  type: string
  priority: string
  dueDate: string | null
  dueTime: string | null
  dueSource: string | null
  title: string
  tags: string[]
  subtasks: unknown[]
  sourceQuote: string | null
}) {
  const due = item.dueDate
    ? `${item.dueSource === 'suggested' ? '~' : ''}${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ''}`
    : '-'
  const extra = [
    item.tags.length ? item.tags.map((t) => `#${t}`).join(' ') : '',
    item.subtasks.length ? `${item.subtasks.length} steps` : '',
    item.sourceQuote ? dim(`"${item.sourceQuote.slice(0, 40)}"`) : dim('(no quote)'),
  ]
    .filter(Boolean)
    .join('  ')
  console.log(
    `   ${item.type.padEnd(8)} ${item.priority.padEnd(6)} ${due.padEnd(17)} ${item.title}  ${extra}`,
  )
}

async function runNdjson(name: string, text: string): Promise<Result> {
  const db = openDb(':memory:')
  const dump = createDump(db, text)
  const start = performance.now()
  let firstItemMs: number | null = null
  let items = 0
  let skipped = 0
  let model: string | null = null
  const notes: string[] = []
  let ok = false

  for await (const event of organizeDump(
    { db, env },
    { dumpId: dump.id, text, now: new Date().toISOString(), timeZone, signal: new AbortController().signal },
  )) {
    if (event.type === 'status' && event.model) model = event.model
    if (event.type === 'meta') console.log(dim(`   meta: ${event.title} - ${event.summary}`))
    if (event.type === 'item') {
      firstItemMs ??= performance.now() - start
      items++
      printItem(event.item)
    }
    if (event.type === 'warning') {
      notes.push(event.message)
      const match = event.message.match(/^(\d+) parts?/)
      if (match) skipped += Number(match[1])
    }
    if (event.type === 'done') {
      ok = true
      model = event.dump.modelUsed
    }
    if (event.type === 'error') notes.push(`ERROR: ${event.message}`)
  }
  return { name, mode: 'ndjson', ok, items, skipped, firstItemMs, totalMs: performance.now() - start, model, note: notes.join(' | ') }
}

// The tool-call method: the same rules, but the answer comes as function arguments.
const toolArgsSchema = z.object({
  meta: z.object({ title: z.string(), summary: z.string() }),
  items: z.array(
    z.object({
      type: z.enum(ITEM_TYPES),
      title: z.string(),
      details: z.string().nullable(),
      priority: z.enum(PRIORITIES),
      due: z
        .object({ date: z.string(), time: z.string().nullable(), source: z.enum(DUE_SOURCES) })
        .nullable(),
      tags: z.array(z.string()),
      quote: z.string().nullable(),
      subtasks: z.array(z.string()),
    }),
  ),
})

async function runTools(name: string, text: string): Promise<Result> {
  const local = localNow(new Date(), timeZone)
  const messages = buildMessages({ text, local, existingTags: [] })
  messages[0]!.content =
    SYSTEM_PROMPT.split('## Output format')[0] +
    '## Output\nCall the function save_items exactly once. Put the dump title and summary in "meta" and every item in "items".'

  const start = performance.now()
  let raw = ''
  let model: string | null = null
  try {
    for await (const chunk of streamChat({
      apiKey: env.OPENROUTER_API_KEY!,
      models: [env.OPENROUTER_MODEL],
      messages,
      reasoningEffort: env.OPENROUTER_REASONING_EFFORT,
      extraBody: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'save_items',
              description: 'Save the organized items of the brain dump.',
              parameters: z.toJSONSchema(toolArgsSchema),
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'save_items' } },
      },
    })) {
      if (chunk.type === 'model') model = chunk.model
      if (chunk.type === 'content') raw += chunk.text
    }
  } catch (error) {
    return { name, mode: 'tools', ok: false, items: 0, skipped: 0, firstItemMs: null, totalMs: performance.now() - start, model, note: `ERROR: ${(error as Error).message}` }
  }
  const totalMs = performance.now() - start

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { name, mode: 'tools', ok: false, items: 0, skipped: 0, firstItemMs: null, totalMs, model, note: `Not JSON: ${raw.slice(0, 120)}` }
  }
  const ctx = { today: local.date, rawText: text, dumpId: 'smoke', seen: new Set<string>() }
  let items = 0
  let skipped = 0
  for (const entry of Array.isArray(parsed?.items) ? parsed.items : []) {
    const line = parseAiObject({ ...entry, kind: 'item' })
    const item = line?.kind === 'item' ? normalizeItem(line, ctx) : null
    if (!item) {
      skipped++
      continue
    }
    items++
    printItem({ ...item, subtasks: item.subtasks })
  }
  // With tool calls, all items arrive together at the end.
  return { name, mode: 'tools', ok: items > 0, items, skipped, firstItemMs: items ? totalMs : null, totalMs, model, note: '' }
}

const results: Result[] = []
for (const dump of dumps) {
  for (const m of mode === 'both' ? (['ndjson', 'tools'] as const) : [mode]) {
    console.log(`\n== ${dump.name} (${m})`)
    const result = m === 'ndjson' ? await runNdjson(dump.name, dump.text) : await runTools(dump.name, dump.text)
    results.push(result)
    if (result.note) console.log(dim(`   ${result.note}`))
  }
}

const secs = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`)
console.log('\nSummary')
console.table(
  results.map((r) => ({
    dump: r.name,
    mode: r.mode,
    ok: r.ok,
    items: r.items,
    skipped: r.skipped,
    'first item': secs(r.firstItemMs),
    total: secs(r.totalMs),
    model: r.model ?? '-',
  })),
)
for (const m of ['ndjson', 'tools'] as const) {
  const rows = results.filter((r) => r.mode === m)
  if (!rows.length) continue
  const items = rows.reduce((n, r) => n + r.items, 0)
  const skipped = rows.reduce((n, r) => n + r.skipped, 0)
  const okCount = rows.filter((r) => r.ok).length
  console.log(
    `${m}: ${okCount}/${rows.length} dumps OK, ${items} items, valid rate ${items + skipped ? ((100 * items) / (items + skipped)).toFixed(0) : 0}%`,
  )
}
