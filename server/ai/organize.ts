import { localNow } from '../../shared/dates'
import type { Dump, Item } from '../../shared/schemas'
import type { Db } from '../db/client'
import {
  createItem,
  getDump,
  listTags,
  topPosition,
  updateDump,
  type DumpPatch,
} from '../db/repo'
import type { Env } from '../env'
import { createObjectScanner, tryParseJson } from './json-stream'
import { normalizeItem, parseAiObject, type NormalizeContext } from './normalize'
import { OpenRouterError, streamChat } from './openrouter'
import { buildMessages } from './prompt'

export type OrganizeEvent =
  | { type: 'status'; phase: 'thinking' | 'writing'; model: string | null }
  | { type: 'meta'; title: string; summary: string }
  | { type: 'item'; item: Item }
  | { type: 'warning'; message: string }
  | { type: 'done'; dump: Dump }
  | { type: 'error'; message: string; dump: Dump | null }

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

export const MISSING_KEY_MESSAGE =
  'The AI is not set up. Add OPENROUTER_API_KEY to .env and restart the server.'

function describeError(error: unknown, abortReason: unknown): string {
  if (abortReason === 'timeout') return 'The AI did not answer in time.'
  if (error instanceof OpenRouterError) {
    const detail = error.message.toLowerCase()
    if (error.status === 401) return 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.'
    if (error.status === 402) return 'OpenRouter says this account has no credits for this model.'
    if (error.status === 429) {
      return 'The free model is busy, or the free daily limit is used up (OpenRouter 429). Try again later.'
    }
    if (detail.includes('data policy') || detail.includes('privacy')) {
      return 'OpenRouter found no endpoint for your privacy settings. Allow free model endpoints at https://openrouter.ai/settings/privacy.'
    }
    return `OpenRouter error${error.status ? ` ${error.status}` : ''}: ${error.message}`
  }
  return `AI request failed: ${(error as Error)?.message ?? String(error)}`
}

/** The model list for each attempt: main model with fallback, then the fallback alone. */
function attemptPlan(env: Env): string[][] {
  const primary = env.OPENROUTER_MODEL
  const fallback = env.OPENROUTER_FALLBACK_MODEL
  if (!fallback || fallback === primary) return [[primary]]
  return [[primary, fallback], [fallback]]
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
    if (!env.OPENROUTER_API_KEY) {
      const dump = finish({ status: 'failed', error: MISSING_KEY_MESSAGE })
      yield { type: 'error', message: MISSING_KEY_MESSAGE, dump }
      return
    }

    const local = localNow(new Date(args.now), args.timeZone)
    const messages = buildMessages({ text: args.text, local, existingTags: listTags(db) })
    const ctx: NormalizeContext = {
      today: local.date,
      rawText: args.text,
      dumpId: args.dumpId,
      seen: new Set(),
    }
    // New items go above everything on the board, in the order the AI sends them.
    const basePosition = topPosition(db) - 1000

    const plan = attemptPlan(env)
    for (const [index, models] of plan.entries()) {
      if (args.signal.aborted) break
      if (index > 0) {
        yield { type: 'warning', message: `${lastError} Trying again with ${models[0]}.` }
      }
      lastError = null
      yield { type: 'status', phase: 'thinking', model: models[0] ?? null }

      const controller = new AbortController()
      const onCancel = () => controller.abort('cancelled')
      args.signal.addEventListener('abort', onCancel)
      let idleTimer = setTimeout(() => controller.abort('timeout'), timeouts.firstChunkMs)
      const totalTimer = setTimeout(() => controller.abort('timeout'), timeouts.totalMs)
      const scanner = createObjectScanner()
      let writing = false
      let retryable = true

      try {
        for await (const chunk of streamChat({
          apiKey: env.OPENROUTER_API_KEY,
          models,
          messages,
          reasoningEffort: env.OPENROUTER_REASONING_EFFORT,
          signal: controller.signal,
          fetch: deps.fetch,
        })) {
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
              const data = normalizeItem(line, ctx)
              if (!data) continue
              const item = createItem(db, { ...data, position: basePosition + saved })
              saved++
              yield { type: 'item', item }
            }
          }
        }
        if (scanner.hasPartial()) skipped++
        if (saved === 0) lastError = 'The AI answer had no readable items.'
      } catch (error) {
        if (args.signal.aborted) break
        lastError = describeError(error, controller.signal.reason)
        if (error instanceof OpenRouterError) retryable = error.retryable
      } finally {
        clearTimeout(idleTimer)
        clearTimeout(totalTimer)
        args.signal.removeEventListener('abort', onCancel)
      }

      // Keep a partial answer: the items that arrived are already saved.
      if (saved > 0 || !retryable) break
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

    if (saved === 0) {
      const message = lastError ?? 'The AI returned no items.'
      const dump = finish({ status: 'failed', error: message })
      yield { type: 'error', message, dump }
      return
    }

    if (lastError) yield { type: 'warning', message: `${lastError} The items that arrived were kept.` }
    const dump = finish({ status: 'done', error: null })
    if (dump) yield { type: 'done', dump }
  } finally {
    // The client can disconnect at any yield. Never leave a dump in "processing".
    if (!finalPatch) {
      updateDump(db, args.dumpId, { modelUsed, status: saved > 0 ? 'done' : 'cancelled' })
    }
  }
}
