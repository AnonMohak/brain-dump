import { z } from 'zod'

// ---------- Enums ----------

export const ITEM_TYPES = ['task', 'idea', 'reminder', 'question'] as const
export const PRIORITIES = ['high', 'medium', 'low'] as const
export const DUE_SOURCES = ['stated', 'suggested'] as const
export const ITEM_STATUSES = ['open', 'done'] as const
export const RECURRENCES = ['daily', 'weekly', 'monthly', 'yearly'] as const
/** Weekdays for a weekly repeat, in calendar order (Monday first). */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const DUMP_STATUSES = ['processing', 'done', 'failed', 'cancelled'] as const

export const itemTypeSchema = z.enum(ITEM_TYPES)
export const prioritySchema = z.enum(PRIORITIES)
export const dueSourceSchema = z.enum(DUE_SOURCES)
export const itemStatusSchema = z.enum(ITEM_STATUSES)
export const dumpStatusSchema = z.enum(DUMP_STATUSES)
export const recurrenceSchema = z.enum(RECURRENCES)
export const weekdaySchema = z.enum(WEEKDAYS)

/** Weekdays for a weekly repeat: unique, in calendar order; an empty list means "none". */
export const repeatDaysSchema = z
  .array(weekdaySchema)
  .transform((days) => {
    const unique = WEEKDAYS.filter((day) => days.includes(day))
    return unique.length ? unique : null
  })

export type ItemType = z.infer<typeof itemTypeSchema>
export type Priority = z.infer<typeof prioritySchema>
export type DueSource = z.infer<typeof dueSourceSchema>
export type ItemStatus = z.infer<typeof itemStatusSchema>
export type DumpStatus = z.infer<typeof dumpStatusSchema>
export type Recurrence = z.infer<typeof recurrenceSchema>
export type Weekday = z.infer<typeof weekdaySchema>

// ---------- Limits ----------

export const MAX_DUMP_CHARS = 20_000
export const MAX_TITLE_CHARS = 200
export const MAX_DETAILS_CHARS = 2_000
export const MAX_TAGS = 5
export const MAX_SUBTASKS = 12

// ---------- Field schemas ----------

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'Not a real calendar date')

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:mm')

/** "#Side Project" -> "side-project" */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

export const tagsSchema = z
  .array(z.string())
  .transform((tags) => [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, MAX_TAGS))

const titleSchema = z.string().trim().min(1, 'Title is empty').max(MAX_TITLE_CHARS)
const detailsSchema = z
  .string()
  .trim()
  .max(MAX_DETAILS_CHARS)
  .transform((value) => (value === '' ? null : value))
  .nullable()

// ---------- Entities (API responses) ----------

export const subtaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
  position: z.number(),
})
export type Subtask = z.infer<typeof subtaskSchema>

export const itemSchema = z.object({
  id: z.string(),
  dumpId: z.string().nullable(),
  type: itemTypeSchema,
  title: z.string(),
  details: z.string().nullable(),
  priority: prioritySchema,
  dueDate: isoDateSchema.nullable(),
  dueTime: timeSchema.nullable(),
  dueSource: dueSourceSchema.nullable(),
  recurrence: recurrenceSchema.nullable(),
  /** Only for a weekly repeat, e.g. ["mon", "wed", "fri"]. Null means "the weekday of the due date". */
  repeatDays: z.array(weekdaySchema).nullable(),
  tags: z.array(z.string()),
  sourceQuote: z.string().nullable(),
  status: itemStatusSchema,
  position: z.number(),
  subtasks: z.array(subtaskSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
})
export type Item = z.infer<typeof itemSchema>

export const dumpSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  status: dumpStatusSchema,
  modelUsed: z.string().nullable(),
  error: z.string().nullable(),
  itemCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Dump = z.infer<typeof dumpSchema>

// ---------- API inputs ----------

const subtaskInputSchema = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  done: z.boolean().default(false),
})

export const createItemInputSchema = z.object({
  type: itemTypeSchema,
  title: titleSchema,
  details: detailsSchema.optional(),
  priority: prioritySchema.default('medium'),
  dueDate: isoDateSchema.nullable().optional(),
  dueTime: timeSchema.nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  repeatDays: repeatDaysSchema.nullable().optional(),
  tags: tagsSchema.default([]),
  subtasks: z.array(subtaskInputSchema).max(MAX_SUBTASKS).default([]),
})
export type CreateItemInput = z.input<typeof createItemInputSchema>

export const updateItemInputSchema = z
  .object({
    type: itemTypeSchema,
    title: titleSchema,
    details: detailsSchema,
    priority: prioritySchema,
    dueDate: isoDateSchema.nullable(),
    dueTime: timeSchema.nullable(),
    dueSource: dueSourceSchema.nullable(),
    recurrence: recurrenceSchema.nullable(),
    repeatDays: repeatDaysSchema.nullable(),
    tags: tagsSchema,
    status: itemStatusSchema,
    position: z.number().finite(),
    subtasks: z.array(subtaskInputSchema).max(MAX_SUBTASKS),
  })
  .partial()
export type UpdateItemInput = z.input<typeof updateItemInputSchema>

export const organizeInputSchema = z.object({
  text: z.string().trim().min(1, 'The dump is empty').max(MAX_DUMP_CHARS),
  /** The browser clock, so that relative dates resolve against the user's "now". */
  now: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1).max(64),
})
export type OrganizeInput = z.infer<typeof organizeInputSchema>

export const rerunInputSchema = organizeInputSchema.pick({ now: true, timeZone: true })
export type RerunInput = z.infer<typeof rerunInputSchema>

export const loginInputSchema = z.object({ password: z.string().min(1).max(200) })

export const aiTextInputSchema = z
  .object({
    mode: z.enum(['plan', 'ask']),
    question: z.string().trim().max(500).optional(),
    now: z.iso.datetime({ offset: true }),
    timeZone: z.string().min(1).max(64),
  })
  .refine((v) => v.mode !== 'ask' || (v.question && v.question.length > 0), {
    message: 'Ask needs a question',
    path: ['question'],
  })
