import { eq, like } from 'drizzle-orm'
import type { Db } from './client'
import { items, settings } from './schema'

export function getSetting(db: Db, key: string): string | null {
  return db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()?.value ?? null
}

export function setSetting(db: Db, key: string, value: string): void {
  const updatedAt = new Date().toISOString()
  db.insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run()
}

export function deleteSetting(db: Db, key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run()
}

/** Removes every setting whose key starts with `prefix` (for example "google."). */
export function deleteSettings(db: Db, prefix: string): void {
  db.delete(settings).where(like(settings.key, `${prefix}%`)).run()
}

export function setItemEventId(db: Db, itemId: string, eventId: string | null): void {
  db.update(items).set({ googleEventId: eventId }).where(eq(items.id, itemId)).run()
}

/** Forgets all event ids, for example after a disconnect or when the calendar is gone. */
export function clearAllEventIds(db: Db): void {
  db.update(items).set({ googleEventId: null }).run()
}
