import { dueState } from '@shared/dates'
import { ITEM_TYPES, type Item, type ItemType, type Priority } from '@shared/schemas'

export const TYPE_META: Record<ItemType, { label: string; plural: string; dot: string; empty: string }> = {
  task: { label: 'Task', plural: 'Tasks', dot: 'bg-type-task', empty: 'Things to do land here.' },
  idea: { label: 'Idea', plural: 'Ideas', dot: 'bg-type-idea', empty: 'Sparks and maybes land here.' },
  reminder: {
    label: 'Reminder',
    plural: 'Reminders',
    dot: 'bg-type-reminder',
    empty: 'Dates not to forget land here.',
  },
  question: {
    label: 'Question',
    plural: 'Questions',
    dot: 'bg-type-question',
    empty: 'Open questions land here.',
  },
}

export const PRIORITY_META: Record<Priority, { label: string; bars: number; rank: number }> = {
  high: { label: 'High', bars: 3, rank: 0 },
  medium: { label: 'Medium', bars: 2, rank: 1 },
  low: { label: 'Low', bars: 1, rank: 2 },
}

/** Open items first, then the board order. */
export function compareItems(a: Item, b: Item): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1
  return a.position - b.position
}

/** Open items that are overdue or due within 24 hours. */
export function isUrgent(item: Item, now = new Date()): boolean {
  const state = dueState(item, now)
  return state === 'overdue' || state === 'soon'
}

export function groupByType(items: Item[]): Record<ItemType, Item[]> {
  const groups: Record<ItemType, Item[]> = { task: [], idea: [], reminder: [], question: [] }
  for (const item of items) groups[item.type].push(item)
  for (const type of ITEM_TYPES) groups[type].sort(compareItems)
  return groups
}
