import { describe, expect, test } from 'bun:test'
import { exportFileName, exportJsonSchema, toJson, toMarkdown } from './export'
import type { Dump, Item } from './schemas'
import { EMPTY_FILTERS } from './view'

const base: Omit<Item, 'id' | 'type' | 'title' | 'priority' | 'position'> = {
  dumpId: 'd1',
  details: null,
  dueDate: null,
  dueTime: null,
  dueSource: null,
  recurrence: null,
  repeatDays: null,
  tags: [],
  sourceQuote: null,
  status: 'open',
  subtasks: [],
  createdAt: '2026-10-14T08:00:00.000Z',
  updatedAt: '2026-10-14T08:00:00.000Z',
  completedAt: null,
}

const items: Item[] = [
  {
    ...base,
    id: 'a',
    type: 'task',
    title: 'Call the dentist',
    priority: 'high',
    position: 1,
    dueDate: '2026-10-17',
    dueSource: 'suggested',
    tags: ['health'],
    sourceQuote: '...my tooth   still hurts, call dentist...',
    subtasks: [
      { id: 's1', text: 'Find the phone number', done: true, position: 0 },
      { id: 's2', text: 'Pick a time slot', done: false, position: 1 },
    ],
  },
  { ...base, id: 'b', type: 'idea', title: 'Podcast about dev tools', priority: 'low', position: 2, tags: ['fun'] },
  {
    ...base,
    id: 'c',
    type: 'reminder',
    title: 'Pay the rent',
    priority: 'medium',
    position: 3,
    dueDate: '2026-11-01',
    dueTime: '09:00',
    dueSource: 'stated',
    status: 'done',
    details: 'Bank transfer.\nUse the new IBAN.',
  },
  { ...base, id: 'd', dumpId: null, type: 'question', title: 'Ask Sam about the budget?', priority: 'medium', position: 4, tags: ['work'] },
]

const dumps: Dump[] = [
  {
    id: 'd1',
    rawText: 'tooth hurts...',
    title: 'Dentist and rent',
    summary: 'A sore tooth and the rent.',
    status: 'done',
    modelUsed: 'm',
    error: null,
    itemCount: 3,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
  },
  {
    id: 'd2',
    rawText: 'unused',
    title: 'Other',
    summary: null,
    status: 'done',
    modelUsed: null,
    error: null,
    itemCount: 0,
    createdAt: '2026-10-13T08:00:00.000Z',
    updatedAt: '2026-10-13T08:00:00.000Z',
  },
]

const exportedAt = new Date(2026, 9, 14, 15, 30)

describe('toMarkdown', () => {
  test('writes readable checklists grouped by type', () => {
    expect(toMarkdown({ items, dumps, filters: EMPTY_FILTERS, exportedAt })).toBe(
      [
        '# Brain dump — 2026-10-14',
        '',
        '## Tasks',
        '- [ ] **Call the dentist** — High · due 2026-10-17 (suggested) · #health',
        '  - [x] Find the phone number',
        '  - [ ] Pick a time slot',
        '  > "...my tooth still hurts, call dentist..."',
        '',
        '## Ideas',
        '- **Podcast about dev tools** — Low · #fun',
        '',
        '## Reminders',
        '- [x] **Pay the rent** — Medium · due 2026-11-01 09:00',
        '  Bank transfer.',
        '  Use the new IBAN.',
        '',
        '## Questions',
        '- **Ask Sam about the budget?** — Medium · #work',
        '',
      ].join('\n'),
    )
  })

  test('names the dump and the active filters', () => {
    const md = toMarkdown({
      items: items.slice(0, 1),
      dumps,
      filters: { ...EMPTY_FILTERS, dump: 'd1', tag: 'health', hideDone: true },
      exportedAt,
    })
    expect(md.startsWith('# Dentist and rent — 2026-10-14\n\n_A sore tooth and the rent._\n\n')).toBe(true)
    expect(md).toContain('> Filters: dump "Dentist and rent", #health, open only')
    expect(md).not.toContain('## Ideas')
  })

  test('says so when the view is empty', () => {
    expect(toMarkdown({ items: [], dumps, filters: EMPTY_FILTERS, exportedAt })).toContain('_No items._')
  })
})

describe('toJson', () => {
  test('matches the export schema and keeps only the dumps in use', () => {
    const data = JSON.parse(toJson({ items, dumps, filters: EMPTY_FILTERS, exportedAt }))
    expect(exportJsonSchema.safeParse(data).success).toBe(true)
    expect(data).toMatchObject({ app: 'sift', version: 1 })
    expect(data.items.map((i: Item) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(data.dumps.map((d: Dump) => d.id)).toEqual(['d1'])
    expect(data.dumps[0].itemCount).toBeUndefined()
  })
})

test('exportFileName uses the local date and time', () => {
  expect(exportFileName('md', exportedAt)).toBe('sift-2026-10-14-1530.md')
  expect(exportFileName('json', exportedAt)).toBe('sift-2026-10-14-1530.json')
})
