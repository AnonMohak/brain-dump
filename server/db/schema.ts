import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import {
  DUE_SOURCES,
  DUMP_STATUSES,
  ITEM_STATUSES,
  ITEM_TYPES,
  PRIORITIES,
  RECURRENCES,
  type Weekday,
} from '../../shared/schemas'

export const dumps = sqliteTable('dumps', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  title: text('title'),
  summary: text('summary'),
  status: text('status', { enum: DUMP_STATUSES }).notNull().default('processing'),
  modelUsed: text('model_used'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    // Null for items that the user adds by hand.
    dumpId: text('dump_id').references(() => dumps.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ITEM_TYPES }).notNull(),
    title: text('title').notNull(),
    details: text('details'),
    priority: text('priority', { enum: PRIORITIES }).notNull().default('medium'),
    dueDate: text('due_date'),
    dueTime: text('due_time'),
    dueSource: text('due_source', { enum: DUE_SOURCES }),
    // Repeating items move to the next date when marked done.
    recurrence: text('recurrence', { enum: RECURRENCES }),
    // Weekdays of a weekly repeat, e.g. ["mon","wed","fri"].
    repeatDays: text('repeat_days', { mode: 'json' }).$type<Weekday[]>(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    sourceQuote: text('source_quote'),
    status: text('status', { enum: ITEM_STATUSES }).notNull().default('open'),
    // Fractional order inside a column. A drag changes one row only.
    position: real('position').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    completedAt: text('completed_at'),
  },
  (t) => [index('items_dump_id_idx').on(t.dumpId)],
)

export const subtasks = sqliteTable(
  'subtasks',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    position: real('position').notNull().default(0),
  },
  (t) => [index('subtasks_item_id_idx').on(t.itemId)],
)
