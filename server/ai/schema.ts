import { z } from 'zod'
import {
  dueSourceSchema,
  isoDateSchema,
  itemTypeSchema,
  MAX_DETAILS_CHARS,
  MAX_SUBTASKS,
  MAX_TITLE_CHARS,
  prioritySchema,
  recurrenceSchema,
  timeSchema,
  WEEKDAYS,
} from '../../shared/schemas'

// The schemas for one line of model output. They accept small mistakes
// (wrong case, a missing field, a bad date) so that one weak field does not
// throw away a whole item. The server fixes the rest in normalize.ts.

const lower = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : value)
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const aiDueSchema = z
  .object({
    date: isoDateSchema,
    time: z.preprocess(emptyToNull, timeSchema.nullable()).catch(null).default(null),
    source: z.preprocess(lower, dueSourceSchema).catch('suggested'),
  })
  .nullable()
  .catch(null)
  .default(null)

export const aiMetaLineSchema = z.object({
  kind: z.literal('meta'),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).catch(''),
})

export const aiItemLineSchema = z.object({
  kind: z.literal('item'),
  type: z.preprocess(lower, itemTypeSchema),
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  details: z.preprocess(emptyToNull, z.string().trim().max(MAX_DETAILS_CHARS).nullable()).catch(null).default(null),
  priority: z.preprocess(lower, prioritySchema).catch('medium'),
  due: aiDueSchema,
  tags: z.array(z.string()).catch([]).default([]),
  quote: z.preprocess(emptyToNull, z.string().nullable()).catch(null).default(null),
  subtasks: z
    .array(z.string().trim().min(1).max(MAX_TITLE_CHARS))
    .max(MAX_SUBTASKS)
    .catch([])
    .default([]),
  repeat: z.preprocess(lower, recurrenceSchema.nullable()).catch(null).default(null),
  repeat_days: z
    .preprocess(
      (v) =>
        Array.isArray(v)
          ? v.filter((d) => typeof d === 'string').map((d: string) => d.trim().toLowerCase().slice(0, 3))
          : v,
      z.array(z.string()),
    )
    .transform((days) => WEEKDAYS.filter((day) => days.includes(day)))
    .catch([])
    .default([]),
})

/** A change to an item that the user already has (prompt rule 13). */
export const aiUpdateLineSchema = z.object({
  kind: z.literal('update'),
  ref: z.preprocess((v) => (typeof v === 'number' ? `#${v}` : v), z.string().regex(/^#?\d+$/)),
  title: z.preprocess(emptyToNull, z.string().trim().min(1).max(MAX_TITLE_CHARS).nullable()).catch(null).default(null),
  details: z.preprocess(emptyToNull, z.string().trim().max(MAX_DETAILS_CHARS).nullable()).catch(null).default(null),
  priority: z.preprocess(lower, prioritySchema.nullable()).catch(null).default(null),
  due: aiDueSchema,
  tags: z.array(z.string()).catch([]).default([]),
})

export const aiLineSchema = z.discriminatedUnion('kind', [aiMetaLineSchema, aiItemLineSchema, aiUpdateLineSchema])

export type AiMetaLine = z.infer<typeof aiMetaLineSchema>
export type AiItemLine = z.infer<typeof aiItemLineSchema>
export type AiUpdateLine = z.infer<typeof aiUpdateLineSchema>
export type AiLine = z.infer<typeof aiLineSchema>
