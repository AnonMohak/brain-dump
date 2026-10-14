import { addDays } from '../../shared/dates'
import { tagsSchema, type Item, type Priority } from '../../shared/schemas'
import type { ItemPatch, NewItem } from '../db/repo'
import { aiLineSchema, type AiItemLine, type AiLine, type AiUpdateLine } from './schema'

/** Days from today for a suggested date, when the model gives none. */
export const SUGGESTED_DAYS: Record<Priority, number> = { high: 1, medium: 5, low: 14 }

/** Parses one model object. Adds a missing "kind" when the shape makes it clear. */
export function parseAiObject(value: unknown): AiLine | null {
  if (value && typeof value === 'object' && !('kind' in value)) {
    const record = value as Record<string, unknown>
    if ('ref' in record) value = { ...record, kind: 'update' }
    else if ('type' in record && 'title' in record) value = { ...record, kind: 'item' }
    else if ('summary' in record && 'title' in record) value = { ...record, kind: 'meta' }
  }
  const result = aiLineSchema.safeParse(value)
  return result.success ? result.data : null
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Keeps a quote only when it really appears in the dump (case and spacing do not matter). */
export function verifyQuote(rawText: string, quote: string | null): string | null {
  if (!quote) return null
  const cleaned = collapse(quote)
    .replace(/^["'“”‘’.…\s]+|["'“”‘’.…\s]+$/g, '')
    .slice(0, 300)
  if (cleaned.length < 3) return null
  return collapse(rawText).toLowerCase().includes(cleaned.toLowerCase()) ? cleaned : null
}

export type NormalizeContext = {
  /** Today in the user's time zone, "YYYY-MM-DD". */
  today: string
  rawText: string
  dumpId: string
  /** "type:title" keys of items already saved for this dump. */
  seen: Set<string>
}

/**
 * Applies the product rules to one AI item:
 * - tasks and reminders always have a date (a suggested one if the text gives none)
 * - ideas and questions keep a date only when the text states it
 * - a suggested date is never in the past
 * - quotes must exist in the dump; tags are normalized; duplicates are dropped
 */
export function normalizeItem(
  line: AiItemLine,
  ctx: NormalizeContext,
): Omit<NewItem, 'position'> | null {
  const key = `${line.type}:${collapse(line.title).toLowerCase()}`
  if (ctx.seen.has(key)) return null
  ctx.seen.add(key)

  let due = line.due
  const needsDate = line.type === 'task' || line.type === 'reminder'

  if (due && due.source === 'suggested' && !needsDate) due = null
  if (due && due.source === 'suggested' && due.date < ctx.today) due = { ...due, date: ctx.today }
  if (!due && needsDate) {
    due = { date: addDays(ctx.today, SUGGESTED_DAYS[line.priority]), time: null, source: 'suggested' }
  }

  return {
    dumpId: ctx.dumpId,
    type: line.type,
    title: collapse(line.title),
    details: line.details,
    priority: line.priority,
    dueDate: due?.date ?? null,
    dueTime: due?.time ?? null,
    dueSource: due?.source ?? null,
    tags: tagsSchema.parse(line.tags),
    sourceQuote: verifyQuote(ctx.rawText, line.quote),
    subtasks: line.subtasks.map((text) => ({ text })),
  }
}

/**
 * Turns an AI update line into a patch for an existing item. Returns null when
 * nothing would change. Rules: details are added (not replaced), tags are
 * merged, and a date changes only when the dump states one (or the item had none).
 */
export function normalizeUpdate(line: AiUpdateLine, item: Item, today: string): ItemPatch | null {
  const patch: ItemPatch = {}
  if (line.title && line.title !== item.title) patch.title = collapse(line.title)
  if (line.priority && line.priority !== item.priority) patch.priority = line.priority
  if (line.details) {
    const extra = line.details.trim()
    if (!item.details) patch.details = extra
    else if (!item.details.toLowerCase().includes(extra.toLowerCase())) {
      patch.details = `${item.details}\n${extra}`.slice(0, 2000)
    }
  }
  if (line.due && (line.due.source === 'stated' || !item.dueDate)) {
    const date = line.due.source === 'suggested' && line.due.date < today ? today : line.due.date
    if (date !== item.dueDate || (line.due.time ?? null) !== item.dueTime) {
      patch.dueDate = date
      patch.dueTime = line.due.time ?? null
      patch.dueSource = line.due.source
    }
  }
  const tags = tagsSchema.parse([...item.tags, ...line.tags])
  if (tags.length !== item.tags.length) patch.tags = tags
  return Object.keys(patch).length ? patch : null
}
