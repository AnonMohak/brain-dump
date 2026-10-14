/**
 * Live AI smoke test. It needs OPENROUTER_API_KEY in .env and uses real requests.
 *
 *   bun run ai:smoke                    all sample dumps, with the provider order of the app
 *   bun run ai:smoke --only=dates       one sample dump
 *
 * Set GEMINI_API_KEY= or OPENROUTER_API_KEY= on the command line to test one provider.
 *
 * Each dump uses one request (more when a fallback runs). Free quotas are small.
 */
import { organizeDump } from '../server/ai/organize'
import { openDb } from '../server/db/client'
import { createDump } from '../server/db/repo'
import { loadEnv } from '../server/env'
import { SMOKE_DUMPS } from './fixtures/dumps'

type Result = {
  name: string
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
const dumps = SMOKE_DUMPS.filter((d) => !args.only || d.name === args.only)

const env = loadEnv()
if (!env.GEMINI_API_KEY && !env.OPENROUTER_API_KEY) {
  console.error('GEMINI_API_KEY and OPENROUTER_API_KEY are empty. Add one to .env first.')
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
  return { name, ok, items, skipped, firstItemMs, totalMs: performance.now() - start, model, note: notes.join(' | ') }
}

const results: Result[] = []
for (const dump of dumps) {
  console.log(`\n== ${dump.name}`)
  const result = await runNdjson(dump.name, dump.text)
  results.push(result)
  if (result.note) console.log(dim(`   ${result.note}`))
}

const secs = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`)
console.log('\nSummary')
console.table(
  results.map((r) => ({
    dump: r.name,
    ok: r.ok,
    items: r.items,
    skipped: r.skipped,
    'first item': secs(r.firstItemMs),
    total: secs(r.totalMs),
    model: r.model ?? '-',
  })),
)
const items = results.reduce((n, r) => n + r.items, 0)
const skipped = results.reduce((n, r) => n + r.skipped, 0)
console.log(
  `${results.filter((r) => r.ok).length}/${results.length} dumps OK, ${items} items, valid rate ${items + skipped ? ((100 * items) / (items + skipped)).toFixed(0) : 0}%`,
)
