import { z } from 'zod'
import { dumpSchema, itemSchema, PRIORITIES, recurrenceSchema, type Dump, type Item, type ItemType } from './schemas'
import { groupByType, hasActiveFilters, type Filters } from './view'

const SECTION: Record<ItemType, string> = {
  task: 'Tasks',
  idea: 'Ideas',
  reminder: 'Reminders',
  question: 'Questions',
}
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const
const CHECKBOX_TYPES: ItemType[] = ['task', 'reminder']

export type ExportInput = {
  /** The items in the current view (filters already applied). */
  items: Item[]
  dumps: Dump[]
  filters: Filters
  exportedAt: Date
}

/** "YYYY-MM-DD" and "HH:mm" in local time. */
function stamp(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}`,
  }
}

export function exportFileName(extension: 'md' | 'json' | 'ics', date: Date): string {
  const { day, time } = stamp(date)
  return `sift-${day}-${time}.${extension}`
}

function describeFilters(filters: Filters, dumps: Dump[]): string {
  const parts: string[] = []
  if (filters.dump) parts.push(`dump "${dumps.find((d) => d.id === filters.dump)?.title ?? filters.dump}"`)
  if (filters.tag) parts.push(`#${filters.tag}`)
  if (filters.priority) parts.push(`${PRIORITY_LABEL[filters.priority].toLowerCase()} priority`)
  if (filters.urgent) parts.push('urgent only')
  if (filters.hideDone) parts.push('open only')
  if (filters.showArchived) parts.push('with archived')
  if (filters.q.trim()) parts.push(`search "${filters.q.trim()}"`)
  return parts.join(', ')
}

/** Keeps a title on one Markdown line. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function itemLine(item: Item): string[] {
  const done = item.status === 'done'
  const meta: string[] = [PRIORITY_LABEL[item.priority]]
  if (item.dueDate) {
    meta.push(
      `due ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ''}${item.dueSource === 'suggested' ? ' (suggested)' : ''}`,
    )
  }
  if (item.recurrence && item.dueDate) meta.push(`repeats ${item.recurrence}`)
  if (item.tags.length) meta.push(item.tags.map((t) => `#${t}`).join(' '))
  if (done && !CHECKBOX_TYPES.includes(item.type)) meta.push('done')

  const marker = CHECKBOX_TYPES.includes(item.type) ? (done ? '- [x] ' : '- [ ] ') : '- '
  const lines = [`${marker}**${oneLine(item.title)}** — ${meta.join(' · ')}`]
  if (item.details) lines.push(...item.details.split('\n').map((line) => `  ${line}`.trimEnd()))
  for (const subtask of item.subtasks) lines.push(`  - [${subtask.done ? 'x' : ' '}] ${oneLine(subtask.text)}`)
  if (item.sourceQuote) lines.push(`  > "${oneLine(item.sourceQuote)}"`)
  return lines
}

export function toMarkdown({ items, dumps, filters, exportedAt }: ExportInput): string {
  const dump = filters.dump ? dumps.find((d) => d.id === filters.dump) : undefined
  const heading = dump?.title ? `# ${oneLine(dump.title)} — ${stamp(exportedAt).day}` : `# Brain dump — ${stamp(exportedAt).day}`
  const out = [heading, '']
  if (dump?.summary) out.push(`_${oneLine(dump.summary)}_`, '')
  if (hasActiveFilters(filters)) out.push(`> Filters: ${describeFilters(filters, dumps)}`, '')

  const groups = groupByType(items)
  let any = false
  for (const type of Object.keys(SECTION) as ItemType[]) {
    if (groups[type].length === 0) continue
    any = true
    out.push(`## ${SECTION[type]}`)
    for (const item of groups[type]) out.push(...itemLine(item))
    out.push('')
  }
  if (!any) out.push('_No items._', '')
  return out.join('\n')
}

export const exportJsonSchema = z.object({
  app: z.literal('sift'),
  version: z.literal(1),
  exportedAt: z.string(),
  filters: z.object({
    dump: z.string().nullable(),
    tag: z.string().nullable(),
    priority: z.enum(PRIORITIES).nullable(),
    urgent: z.boolean(),
    hideDone: z.boolean(),
    showArchived: z.boolean(),
    q: z.string(),
  }),
  dumps: z.array(dumpSchema.omit({ itemCount: true })),
  items: z.array(itemSchema),
})
export type ExportJson = z.infer<typeof exportJsonSchema>

export function toJson({ items, dumps, filters, exportedAt }: ExportInput): string {
  const ordered = Object.values(groupByType(items)).flat()
  const usedDumpIds = new Set(ordered.map((item) => item.dumpId).filter(Boolean))
  const data: ExportJson = {
    app: 'sift',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    filters,
    dumps: dumps
      .filter((dump) => usedDumpIds.has(dump.id))
      .map(({ itemCount: _count, ...dump }) => dump),
    items: ordered,
  }
  return JSON.stringify(data, null, 2) + '\n'
}

/**
 * What /api/import accepts: a Sift JSON export. Lenient about fields that
 * older exports do not have (recurrence, newer filters).
 */
export const importJsonSchema = z.object({
  app: z.literal('sift'),
  version: z.literal(1),
  dumps: z.array(dumpSchema.omit({ itemCount: true })).max(5000),
  items: z
    .array(itemSchema.extend({ recurrence: recurrenceSchema.nullable().default(null) }))
    .max(20000),
})
export type ImportJson = z.infer<typeof importJsonSchema>
