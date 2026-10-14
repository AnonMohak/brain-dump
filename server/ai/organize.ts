import { localNow } from '../../shared/dates'
import type { OrganizeEvent } from '../../shared/events'
import type { Db } from '../db/client'
import {
  createItem,
  getDump,
  getItem,
  listItems,
  listTags,
  updateItem,
  topPosition,
  updateDump,
  type DumpPatch,
} from '../db/repo'
import type { Env } from '../env'
import { createObjectScanner, tryParseJson } from './json-stream'
import { normalizeItem, normalizeUpdate, parseAiObject, type NormalizeContext } from './normalize'
import { AiError, PROVIDER_NAME } from './chat-stream'
import { attemptPlan } from './providers'
import { buildMessages } from './prompt'

export type { OrganizeEvent }

export type AiTimeouts = {
  /** Wait this long for the first chunk of an answer. */
  firstChunkMs: number
  /** Wait this long between two chunks. */
  idleMs: number
  /** Hard limit for one attempt. */
  totalMs: number
}

export const DEFAULT_TIMEOUTS: AiTimeouts = {
  firstChunkMs: 90_000,
  idleMs: 60_000,
  totalMs: 300_000,
}

export type OrganizeDeps = {
  db: Db
  env: Env
  fetch?: typeof fetch
  timeouts?: Partial<AiTimeouts>
}

export type OrganizeArgs = {
  dumpId: string
  text: string
  /** ISO time from the browser. */
  now: string
  timeZone: string
  signal: AbortSignal
}

/** How many open items the prompt lists for merging. */
const MAX_EXISTING_ITEMS = 100

export const MISSING_KEY_MESSAGE =
  'The AI is not set up. Add GEMINI_API_KEY or OPENROUTER_API_KEY to .env and restart the server.'

function describeError(error: unknown, abortReason: unknown, model: string): string {
  if (abortReason === 'timeout') return `${model} did not answer in time.`
  if (error instanceof AiError) {
    const name = PROVIDER_NAME[error.provider]
    const keyVar = error.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENROUTER_API_KEY'
    const detail = error.message.toLowerCase()
    if (error.status === 401 || error.status === 403 || detail.includes('api key not valid') || detail.includes('api_key_invalid')) {
      return `${name} rejected the API key. Check ${keyVar} in .env.`
    }
    if (error.status === 402) return `${name} says this account has no credits for this model.`
    if (error.status === 429) {
      return `${model} is busy, or its free limit is used up (${name} 429).`
    }
    if (error.provider === 'openrouter' && (detail.includes('data policy') || detail.includes('privacy'))) {
      return 'OpenRouter found no endpoint for your privacy settings. Allow free model endpoints at https://openrouter.ai/settings/privacy.'
    }
    return `${name} error${error.status ? ` ${error.status}` : ''}: ${error.message}`
  }
  return `AI request failed: ${(error as Error)?.message ?? String(error)}`
}

/**
 * Sends a dump to the AI and saves each item the moment it arrives.
 * Yields events for the SSE stream. Always leaves the dump in a final state.
 */
export async function* organizeDump(
  deps: OrganizeDeps,
  args: OrganizeArgs,
): AsyncGenerator<OrganizeEvent> {
  const { db, env } = deps
  const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts }

  let saved = 0
  /** Existing items that the dump updated instead of duplicating. */
  let merged = 0
  let skipped = 0
  let modelUsed: string | null = null
  let lastError: string | null = null
  let finalPatch: DumpPatch | null = null

  const finish = (patch: DumpPatch) => {
    finalPatch = { modelUsed, ...patch }
    updateDump(db, args.dumpId, finalPatch)
    return getDump(db, args.dumpId)
  }

  try {
    const plan = attemptPlan(env)
    if (plan.length === 0) {
      const dump = finish({ status: 'failed', error: MISSING_KEY_MESSAGE })
      yield { type: 'error', message: MISSING_KEY_MESSAGE, dump }
      return
    }

    const local = localNow(new Date(args.now), args.timeZone)
    // Open items that the AI may update instead of duplicating (newest first, short refs).
    const openItems = listItems(db)
      .filter((item) => item.status === 'open')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_EXISTING_ITEMS)
    const refs = new Map(openItems.map((item, index) => [`#${index + 1}`, item.id]))
    const messages = buildMessages({
      text: args.text,
      local,
      existingTags: listTags(db),
      existingItems: openItems.map((item, index) => ({
        ref: `#${index + 1}`,
        type: item.type,
        title: item.title,
        priority: item.priority,
        dueDate: item.dueDate,
      })),
    })
    const ctx: NormalizeContext = {
      today: local.date,
      rawText: args.text,
      dumpId: args.dumpId,
      seen: new Set(),
    }
    // New items go above everything on the board, in the order the AI sends them.
    const basePosition = topPosition(db) - 1000

    // Providers whose key was rejected; their other tries are skipped.
    const blocked = new Set<string>()
    let tried = 0
    for (const attempt of plan) {
      if (args.signal.aborted) break
      if (blocked.has(attempt.provider)) continue
      if (tried > 0) {
        yield { type: 'warning', message: `${lastError} Trying ${attempt.model} instead.` }
      }
      tried++
      lastError = null
      yield { type: 'status', phase: 'thinking', model: attempt.model }

      const controller = new AbortController()
      const onCancel = () => controller.abort('cancelled')
      args.signal.addEventListener('abort', onCancel)
      let idleTimer = setTimeout(() => controller.abort('timeout'), timeouts.firstChunkMs)
      const totalTimer = setTimeout(() => controller.abort('timeout'), timeouts.totalMs)
      const scanner = createObjectScanner()
      let writing = false

      try {
        for await (const chunk of attempt.stream(messages, controller.signal, deps.fetch)) {
          clearTimeout(idleTimer)
          idleTimer = setTimeout(() => controller.abort('timeout'), timeouts.idleMs)

          if (chunk.type === 'model') {
            modelUsed = chunk.model
          } else if (chunk.type === 'finish' && chunk.reason === 'length') {
            yield { type: 'warning', message: 'The AI answer was cut off. Some thoughts may be missing.' }
          } else if (chunk.type === 'content') {
            if (!writing) {
              writing = true
              yield { type: 'status', phase: 'writing', model: modelUsed }
            }
            for (const raw of scanner.feed(chunk.text)) {
              const line = parseAiObject(tryParseJson(raw))
              if (!line) {
                skipped++
                continue
              }
              if (line.kind === 'meta') {
                updateDump(db, args.dumpId, { title: line.title, summary: line.summary || null })
                yield { type: 'meta', title: line.title, summary: line.summary }
                continue
              }
              if (line.kind === 'update') {
                const id = refs.get(line.ref.startsWith('#') ? line.ref : `#${line.ref}`)
                const existing = id ? getItem(db, id) : null
                if (!existing || existing.status !== 'open') {
                  skipped++
                  continue
                }
                const patch = normalizeUpdate(line, existing, ctx.today)
                if (!patch) continue
                const item = updateItem(db, existing.id, patch)
                if (!item) continue
                merged++
                refs.delete(line.ref) // one update per item
                yield { type: 'update', item }
                continue
              }
              const data = normalizeItem(line, ctx)
              if (!data) continue
              const item = createItem(db, { ...data, position: basePosition + saved })
              saved++
              yield { type: 'item', item }
            }
          }
        }
        if (scanner.hasPartial()) skipped++
        if (saved + merged === 0) lastError = 'The AI answer had no readable items.'
      } catch (error) {
        if (args.signal.aborted) break
        lastError = describeError(error, controller.signal.reason, attempt.model)
        if (error instanceof AiError && !error.retryable) blocked.add(attempt.provider)
      } finally {
        clearTimeout(idleTimer)
        clearTimeout(totalTimer)
        args.signal.removeEventListener('abort', onCancel)
      }

      // Keep a partial answer: the items that arrived are already saved.
      if (saved + merged > 0) break
    }

    if (args.signal.aborted) {
      finish({ status: 'cancelled', error: null })
      return
    }

    if (skipped > 0) {
      yield {
        type: 'warning',
        message: `${skipped} part${skipped === 1 ? '' : 's'} of the AI answer could not be read and were skipped.`,
      }
    }

    if (saved + merged === 0) {
      const message = lastError ?? 'The AI returned no items.'
      const dump = finish({ status: 'failed', error: message })
      yield { type: 'error', message, dump }
      return
    }

    if (lastError) yield { type: 'warning', message: `${lastError} The items that arrived were kept.` }
    const dump = finish({ status: 'done', error: null })
    if (dump) yield { type: 'done', dump, merged }
  } finally {
    // The client can disconnect at any yield. Never leave a dump in "processing".
    if (!finalPatch) {
      updateDump(db, args.dumpId, { modelUsed, status: saved + merged > 0 ? 'done' : 'cancelled' })
    }
  }
}
