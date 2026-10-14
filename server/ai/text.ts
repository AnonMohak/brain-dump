import { localNow, type LocalNow } from '../../shared/dates'
import type { TextEvent, TextMode } from '../../shared/events'
import { describeRepeat } from '../../shared/recurrence'
import type { Item } from '../../shared/schemas'
import type { Db } from '../db/client'
import { listItems } from '../db/repo'
import type { Env } from '../env'
import { AiError, PROVIDER_NAME } from './chat-stream'
import { DEFAULT_TIMEOUTS, MISSING_KEY_MESSAGE, type AiTimeouts } from './organize'
import { dateGuide, type ChatMessage } from './prompt'
import { attemptPlan } from './providers'

export type { TextEvent, TextMode }

const MAX_CONTEXT_ITEMS = 150

const PLAN_PROMPT = `You are Sift. Make a realistic plan for the user's day from their open items.
Rules:
- Use only the items in the list. Never invent items.
- Pick at most 6 items: overdue first, then items due today, then high priority items.
- Write Markdown: one short sentence to start, then a numbered list. Each line: **item title** — a short reason or a concrete first step, plus "morning", "afternoon" or "evening" when it helps.
- End with one line that starts with "Later this week:" and names up to 3 items, or leave it out when nothing fits.
- Mention dates in a friendly form ("today", "tomorrow", "Fri Oct 16"), never as YYYY-MM-DD.
- Keep the whole answer under 150 words. Write in English. No headings, no tables.`

const ASK_PROMPT = `You are Sift. Answer the user's question about their own items.
Rules:
- Use only the items in the list. If nothing matches, say so in one sentence.
- Be short: under 120 words. Use a Markdown list ("- ") when you name several items, with the item title in **bold**.
- Mention due dates in a friendly form ("tomorrow", "Fri Oct 16"). Write in English. No headings, no tables.`

/** One compact line per item, for the model's context. */
function itemLine(item: Item): string {
  const parts = [`${item.type}`, item.priority]
  if (item.dueDate) parts.push(`due ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ''}`)
  if (item.recurrence) parts.push(`repeats ${describeRepeat(item.recurrence, item.repeatDays).toLowerCase()}`)
  if (item.status === 'done') parts.push(item.completedAt ? `done on ${item.completedAt.slice(0, 10)}` : 'done')
  if (item.tags.length) parts.push(item.tags.map((t) => `#${t}`).join(' '))
  const steps = item.subtasks.length ? `; steps ${item.subtasks.filter((s) => s.done).length}/${item.subtasks.length}` : ''
  return `- ${item.title} (${parts.join(', ')}${steps})`
}

export function buildTextMessages(args: {
  mode: TextMode
  question?: string
  local: LocalNow
  items: Item[]
}): ChatMessage[] {
  const { mode, question, local, items } = args
  // Open items first, then recently done ones (useful for "what did I finish?").
  const open = items.filter((i) => i.status === 'open')
  const done = items
    .filter((i) => i.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  const context = (mode === 'plan' ? open : [...open, ...done]).slice(0, MAX_CONTEXT_ITEMS)
  const header = `Today: ${local.weekday} ${local.date}, ${local.time} (${local.timeZone}).\nDate guide: ${dateGuide(local)}.`
  const list = context.length ? context.map(itemLine).join('\n') : '(no items)'
  const ask = mode === 'ask' ? `\nQuestion: ${question}` : '\nMake my plan for today.'
  return [
    { role: 'system', content: mode === 'plan' ? PLAN_PROMPT : ASK_PROMPT },
    { role: 'user', content: `${header}\nItems:\n${list}${ask}` },
  ]
}

export type TextDeps = { db: Db; env: Env; fetch?: typeof fetch; timeouts?: Partial<AiTimeouts> }

function describe(error: unknown, abortReason: unknown, model: string): string {
  if (abortReason === 'timeout') return `${model} did not answer in time.`
  if (error instanceof AiError) {
    if (error.status === 429) return `${model} is busy, or its free limit is used up.`
    return `${PROVIDER_NAME[error.provider]} error${error.status ? ` ${error.status}` : ''}: ${error.message}`
  }
  return `AI request failed: ${(error as Error)?.message ?? String(error)}`
}

/** Streams a short Markdown answer about the board, with the same provider order and fallbacks as organizing. */
export async function* streamText(
  deps: TextDeps,
  args: { mode: TextMode; question?: string; now: string; timeZone: string; signal: AbortSignal },
): AsyncGenerator<TextEvent> {
  const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts }
  const plan = attemptPlan(deps.env)
  if (plan.length === 0) {
    yield { type: 'error', message: MISSING_KEY_MESSAGE }
    return
  }
  const messages = buildTextMessages({
    mode: args.mode,
    question: args.question,
    local: localNow(new Date(args.now), args.timeZone),
    items: listItems(deps.db),
  })

  let lastError = 'The AI returned no answer.'
  for (const attempt of plan) {
    if (args.signal.aborted) return
    yield { type: 'status', model: attempt.model }
    const controller = new AbortController()
    const onCancel = () => controller.abort('cancelled')
    args.signal.addEventListener('abort', onCancel)
    let timer = setTimeout(() => controller.abort('timeout'), timeouts.firstChunkMs)
    let wrote = false
    let model: string = attempt.model
    try {
      for await (const chunk of attempt.stream(messages, controller.signal, deps.fetch)) {
        clearTimeout(timer)
        timer = setTimeout(() => controller.abort('timeout'), timeouts.idleMs)
        if (chunk.type === 'model') model = chunk.model
        if (chunk.type === 'content') {
          wrote = true
          yield { type: 'text', delta: chunk.text }
        }
      }
      if (wrote) {
        yield { type: 'done', model }
        return
      }
    } catch (error) {
      if (args.signal.aborted) return
      lastError = describe(error, controller.signal.reason, attempt.model)
      // Text that already arrived stays; do not mix in a second answer.
      if (wrote) {
        yield { type: 'error', message: `${lastError} The answer may be incomplete.` }
        return
      }
    } finally {
      clearTimeout(timer)
      args.signal.removeEventListener('abort', onCancel)
    }
  }
  yield { type: 'error', message: lastError }
}
