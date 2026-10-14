import { dueState } from '@shared/dates'
import type { Item, ItemType, Priority } from '@shared/schemas'

export { compareItems, groupByType } from '@shared/view'

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

/** Open items that are overdue or due within 24 hours. */
export function isUrgent(item: Item, now = new Date()): boolean {
  const state = dueState(item, now)
  return state === 'overdue' || state === 'soon'
}
