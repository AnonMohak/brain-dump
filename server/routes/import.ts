import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { importJsonSchema, type ImportJson } from '../../shared/export'
import type { Db } from '../db/client'
import { dumps, items, subtasks } from '../db/schema'
import { validate } from '../validate'

export type ImportResult = { dumps: number; items: number; skipped: number }

/** Adds the dumps and items of an export that are not in the database yet (matched by id). */
export function importData(db: Db, data: ImportJson): ImportResult {
  return db.transaction((tx) => {
    const dumpIds = data.dumps.map((d) => d.id)
    const existingDumps = new Set(
      dumpIds.length ? tx.select({ id: dumps.id }).from(dumps).where(inArray(dumps.id, dumpIds)).all().map((r) => r.id) : [],
    )
    const newDumps = data.dumps.filter((d) => !existingDumps.has(d.id))
    for (const dump of newDumps) {
      // A dump that was still processing when exported is shown as stopped.
      tx.insert(dumps).values({ ...dump, status: dump.status === 'processing' ? 'cancelled' : dump.status }).run()
    }

    const knownDumps = new Set([...existingDumps, ...newDumps.map((d) => d.id)])
    const itemIds = data.items.map((i) => i.id)
    const existingItems = new Set(
      itemIds.length ? tx.select({ id: items.id }).from(items).where(inArray(items.id, itemIds)).all().map((r) => r.id) : [],
    )
    const newItems = data.items.filter((i) => !existingItems.has(i.id))
    for (const { subtasks: steps, ...item } of newItems) {
      tx.insert(items)
        .values({ ...item, dumpId: item.dumpId && knownDumps.has(item.dumpId) ? item.dumpId : null })
        .run()
      steps.forEach((step, index) => {
        tx.insert(subtasks)
          .values({ id: crypto.randomUUID(), itemId: item.id, text: step.text, done: step.done, position: index })
          .run()
      })
    }

    return {
      dumps: newDumps.length,
      items: newItems.length,
      skipped: data.items.length - newItems.length + (data.dumps.length - newDumps.length),
    }
  })
}

export function importRoutes(db: Db) {
  return new Hono().post('/', validate('json', importJsonSchema), (c) => c.json(importData(db, c.req.valid('json'))))
}
