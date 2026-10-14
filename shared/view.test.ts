import { describe, expect, test } from 'bun:test'
import type { Item } from './schemas'
import {
  allTags,
  applyFilters,
  EMPTY_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  groupByType,
  hasActiveFilters,
  positionBetween,
} from './view'

let counter = 0
function makeItem(fields: Partial<Item> = {}): Item {
  counter++
  return {
    id: `i${counter}`,
    dumpId: 'd1',
    type: 'task',
    title: `Item ${counter}`,
    details: null,
    priority: 'medium',
    dueDate: null,
    dueTime: null,
    dueSource: null,
    tags: [],
    sourceQuote: null,
    status: 'open',
    position: counter,
    subtasks: [],
    createdAt: '2026-10-14T00:00:00Z',
    updatedAt: '2026-10-14T00:00:00Z',
    completedAt: null,
    ...fields,
  }
}

describe('URL round trip', () => {
  test('filters survive the URL', () => {
    const filters = { ...EMPTY_FILTERS, dump: 'd1', tag: 'work', priority: 'high' as const, urgent: true, hideDone: true, q: 'slides' }
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters)
    expect(filtersToSearch(EMPTY_FILTERS)).toBe('')
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  test('ignores unknown values', () => {
    expect(filtersFromSearch('?priority=urgent&urgent=yes')).toEqual(EMPTY_FILTERS)
  })
})

describe('applyFilters', () => {
  const now = new Date(2026, 9, 14, 12, 0)
  const a = makeItem({ dumpId: 'd1', tags: ['work'], priority: 'high', title: 'Finish the slides' })
  const b = makeItem({ dumpId: 'd2', tags: ['home'], status: 'done' })
  const c = makeItem({ dumpId: 'd2', dueDate: '2026-10-13', subtasks: [{ id: 's', text: 'call the plumber', done: false, position: 0 }] })
  const d = makeItem({ dumpId: null, dueDate: '2026-10-30' })
  const items = [a, b, c, d]
  const ids = (list: Item[]) => list.map((i) => i.id)

  test('no filters show everything', () => {
    expect(applyFilters(items, EMPTY_FILTERS, now)).toHaveLength(4)
  })

  test('each filter narrows the list', () => {
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, dump: 'd2' }, now))).toEqual([b.id, c.id])
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, tag: 'work' }, now))).toEqual([a.id])
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, priority: 'high' }, now))).toEqual([a.id])
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, hideDone: true }, now))).toEqual([a.id, c.id, d.id])
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, urgent: true }, now))).toEqual([c.id])
  })

  test('search looks at titles and subtasks, ignoring case', () => {
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, q: 'SLIDES' }, now))).toEqual([a.id])
    expect(ids(applyFilters(items, { ...EMPTY_FILTERS, q: 'plumber' }, now))).toEqual([c.id])
  })
})

describe('board order', () => {
  test('groups by type, open items first, then by position', () => {
    const items = [
      makeItem({ id: 'x', position: 1, status: 'done' }),
      makeItem({ id: 'y', position: 3 }),
      makeItem({ id: 'z', position: 2 }),
      makeItem({ id: 'q', type: 'question' }),
    ]
    const groups = groupByType(items)
    expect(groups.task.map((i) => i.id)).toEqual(['z', 'y', 'x'])
    expect(groups.question.map((i) => i.id)).toEqual(['q'])
    expect(groups.idea).toEqual([])
  })

  test('positionBetween', () => {
    expect(positionBetween(undefined, undefined)).toBe(0)
    expect(positionBetween(undefined, 5)).toBe(4)
    expect(positionBetween(5, undefined)).toBe(6)
    expect(positionBetween(1, 2)).toBe(1.5)
  })

  test('allTags is sorted and unique', () => {
    expect(allTags([makeItem({ tags: ['b', 'a'] }), makeItem({ tags: ['a'] })])).toEqual(['a', 'b'])
  })
})
