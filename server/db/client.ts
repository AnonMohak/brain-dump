import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

const MIGRATIONS_FOLDER = resolve(import.meta.dir, '../../drizzle')

/** Opens the SQLite file (or ":memory:"), turns on foreign keys and applies migrations. */
export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true })

  const sqlite = new Database(path, { create: true, strict: true })
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}

export type Db = ReturnType<typeof openDb>
