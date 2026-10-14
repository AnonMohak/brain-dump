import { dueState } from './dates'
import { ITEM_TYPES, PRIORITIES, type Item, type ItemType, type Priority } from './schemas'

/** What the board shows. The same filters decide what an export contains. */
export type Filters = {
  dump: string | null
  tag: string | null
  priority: Priority | null
  /** Only overdue items and items due within 24 hours. */
  urgent: boolean
  hideDone: boolean
  q: string
}

export const EMPTY_FILTERS: Filters = {
  dump: null,
  tag: null,
  priority: null,
  urgent: false,
  hideDone: false,
  q: '',
}

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(f.dump || f.tag || f.priority || f.urgent || f.hideDone || f.q.trim())
}

export function filtersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search)
  const priority = params.get('priority')
  return {
    dump: params.get('dump') || null,
    tag: params.get('tag') || null,
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : null,
    urgent: params.get('urgent') === '1',
    hideDone: params.get('hideDone') === '1',
    q: params.get('q') ?? '',
  }
}

export function filtersToSearch(f: Filters): string {
  const params = new URLSearchParams()
  if (f.dump) params.set('dump', f.dump)
  if (f.tag) params.set('tag', f.tag)
  if (f.priority) params.set('priority', f.priority)
  if (f.urgent) params.set('urgent', '1')
  if (f.hideDone) params.set('hideDone', '1')
  if (f.q.trim()) params.set('q', f.q.trim())
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function applyFilters(items: Item[], f: Filters, now: Date = new Date()): Item[] {
  const q = f.q.trim().toLowerCase()
  return items.filter((item) => {
    if (f.dump && item.dumpId !== f.dump) return false
    if (f.tag && !item.tags.includes(f.tag)) return false
    if (f.priority && item.priority !== f.priority) return false
    if (f.hideDone && item.status === 'done') return false
    if (f.urgent) {
      const state = dueState(item, now)
      if (state !== 'overdue' && state !== 'soon') return false
    }
    if (q) {
      const haystack = [item.title, item.details ?? '', item.sourceQuote ?? '', ...item.tags, ...item.subtasks.map((s) => s.text)]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

/** Open items first, then the board order. */
export function compareItems(a: Item, b: Item): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1
  return a.position - b.position
}

export function groupByType(items: Item[]): Record<ItemType, Item[]> {
  const groups: Record<ItemType, Item[]> = { task: [], idea: [], reminder: [], question: [] }
  for (const item of items) groups[item.type].push(item)
  for (const type of ITEM_TYPES) groups[type].sort(compareItems)
  return groups
}

/** A position between two neighbours, for a card dropped between them. */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

export function allTags(items: Item[]): string[] {
  return [...new Set(items.flatMap((item) => item.tags))].sort()
}
