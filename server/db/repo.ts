import { asc, count, desc, eq, min } from 'drizzle-orm'
import type {
  DueSource,
  Dump,
  DumpStatus,
  Item,
  ItemType,
  Priority,
  updateItemInputSchema,
} from '../../shared/schemas'
import type { z } from 'zod'
import type { Db } from './client'
import { dumps, items, subtasks } from './schema'

const nowIso = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

type ItemRow = typeof items.$inferSelect
type SubtaskRow = typeof subtasks.$inferSelect
type DumpRow = typeof dumps.$inferSelect

function toItem(row: ItemRow, subRows: SubtaskRow[]): Item {
  return {
    ...row,
    subtasks: subRows
      .filter((s) => s.itemId === row.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, text: s.text, done: s.done, position: s.position })),
  }
}

function toDump(row: DumpRow, itemCount: number): Dump {
  return { ...row, itemCount }
}

// ---------- Items ----------

export type NewItem = {
  dumpId: string | null
  type: ItemType
  title: string
  details: string | null
  priority: Priority
  dueDate: string | null
  dueTime: string | null
  dueSource: DueSource | null
  tags: string[]
  sourceQuote: string | null
  position: number
  subtasks: { id?: string; text: string; done?: boolean }[]
}

export type ItemPatch = z.output<typeof updateItemInputSchema>

export function listItems(db: Db): Item[] {
  const rows = db.select().from(items).orderBy(asc(items.position)).all()
  const subRows = db.select().from(subtasks).all()
  return rows.map((row) => toItem(row, subRows))
}

export function getItem(db: Db, id: string): Item | null {
  const row = db.select().from(items).where(eq(items.id, id)).get()
  if (!row) return null
  const subRows = db.select().from(subtasks).where(eq(subtasks.itemId, id)).all()
  return toItem(row, subRows)
}

function insertSubtasks(tx: Pick<Db, 'insert'>, itemId: string, list: NewItem['subtasks']) {
  if (list.length === 0) return
  tx.insert(subtasks)
    .values(
      list.map((s, index) => ({
        id: s.id ?? newId(),
        itemId,
        text: s.text,
        done: s.done ?? false,
        position: index,
      })),
    )
    .run()
}

export function createItem(db: Db, input: NewItem): Item {
  const id = newId()
  const timestamp = nowIso()
  db.transaction((tx) => {
    tx.insert(items)
      .values({
        id,
        dumpId: input.dumpId,
        type: input.type,
        title: input.title,
        details: input.details,
        priority: input.priority,
        dueDate: input.dueDate,
        dueTime: input.dueDate ? input.dueTime : null,
        dueSource: input.dueDate ? input.dueSource : null,
        tags: input.tags,
        sourceQuote: input.sourceQuote,
        status: 'open',
        position: input.position,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      })
      .run()
    insertSubtasks(tx, id, input.subtasks)
  })
  return getItem(db, id)!
}

export function updateItem(db: Db, id: string, patch: ItemPatch): Item | null {
  const current = db.select().from(items).where(eq(items.id, id)).get()
  if (!current) return null

  const { subtasks: subtaskPatch, ...fields } = patch
  const timestamp = nowIso()
  const values: Partial<ItemRow> = { ...fields, updatedAt: timestamp }

  if (fields.status !== undefined && fields.status !== current.status) {
    values.completedAt = fields.status === 'done' ? timestamp : null
  }
  // A date that the user picks is a firm date, not an AI suggestion.
  if (fields.dueDate !== undefined && fields.dueSource === undefined) {
    values.dueSource = fields.dueDate ? 'stated' : null
  }
  if (fields.dueDate === null) {
    values.dueTime = null
    values.dueSource = null
  }

  db.transaction((tx) => {
    tx.update(items).set(values).where(eq(items.id, id)).run()
    if (subtaskPatch) {
      tx.delete(subtasks).where(eq(subtasks.itemId, id)).run()
      insertSubtasks(tx, id, subtaskPatch)
    }
  })
  return getItem(db, id)
}

export function deleteItem(db: Db, id: string): boolean {
  return db.delete(items).where(eq(items.id, id)).returning({ id: items.id }).all().length > 0
}

/** The smallest position in a column (or on the whole board), so new items can go on top. */
export function topPosition(db: Db, type?: ItemType): number {
  const query = db.select({ value: min(items.position) }).from(items)
  const row = type ? query.where(eq(items.type, type)).get() : query.get()
  return row?.value ?? 0
}

export function listTags(db: Db): string[] {
  const rows = db.select({ tags: items.tags }).from(items).all()
  return [...new Set(rows.flatMap((row) => row.tags))].sort()
}

// ---------- Dumps ----------

function itemCounts(db: Db): Map<string, number> {
  const rows = db
    .select({ dumpId: items.dumpId, n: count() })
    .from(items)
    .groupBy(items.dumpId)
    .all()
  return new Map(rows.filter((r) => r.dumpId).map((r) => [r.dumpId!, r.n]))
}

export function createDump(db: Db, rawText: string): Dump {
  const timestamp = nowIso()
  const row = {
    id: newId(),
    rawText,
    title: null,
    summary: null,
    status: 'processing' as const,
    modelUsed: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  db.insert(dumps).values(row).run()
  return toDump(row, 0)
}

export type DumpPatch = Partial<{
  title: string | null
  summary: string | null
  status: DumpStatus
  modelUsed: string | null
  error: string | null
}>

export function updateDump(db: Db, id: string, patch: DumpPatch): void {
  db.update(dumps)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(dumps.id, id))
    .run()
}

export function getDump(db: Db, id: string): Dump | null {
  const row = db.select().from(dumps).where(eq(dumps.id, id)).get()
  if (!row) return null
  return toDump(row, itemCounts(db).get(id) ?? 0)
}

export function listDumps(db: Db): Dump[] {
  const counts = itemCounts(db)
  return db
    .select()
    .from(dumps)
    .orderBy(desc(dumps.createdAt))
    .all()
    .map((row) => toDump(row, counts.get(row.id) ?? 0))
}

export function deleteDump(db: Db, id: string): boolean {
  return db.delete(dumps).where(eq(dumps.id, id)).returning({ id: dumps.id }).all().length > 0
}

export function deleteDumpItems(db: Db, dumpId: string): number {
  return db.delete(items).where(eq(items.dumpId, dumpId)).returning({ id: items.id }).all().length
}
