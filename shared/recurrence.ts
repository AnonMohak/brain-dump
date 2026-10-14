import { addDays } from './dates'
import type { Item, Recurrence } from './schemas'

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** Adds months and keeps the day where it can ("Jan 31" + 1 month = "Feb 28"). */
function addMonths(isoDate: string, months: number, anchorDay: number): string {
  const [y, m] = isoDate.split('-').map(Number) as [number, number]
  const total = (m - 1) + months
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(anchorDay, lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The next date after `isoDate` for a recurrence. */
export function nextOccurrence(isoDate: string, recurrence: Recurrence, anchorDay?: number): string {
  const day = anchorDay ?? Number(isoDate.slice(8, 10))
  switch (recurrence) {
    case 'daily':
      return addDays(isoDate, 1)
    case 'weekly':
      return addDays(isoDate, 7)
    case 'monthly':
      return addMonths(isoDate, 1, day)
    case 'yearly':
      return addMonths(isoDate, 12, day)
  }
}

/**
 * The next due date when a repeating item is marked done: the first
 * occurrence after the current due date that is not before today.
 */
export function nextDueDate(dueDate: string, recurrence: Recurrence, today: string): string {
  const anchor = Number(dueDate.slice(8, 10))
  let next = nextOccurrence(dueDate, recurrence, anchor)
  for (let guard = 0; next < today && guard < 1000; guard++) next = nextOccurrence(next, recurrence, anchor)
  return next
}

/** True when marking this item done should move it to its next date instead. */
export function isRecurring(item: Pick<Item, 'recurrence' | 'dueDate'>): boolean {
  return Boolean(item.recurrence && item.dueDate)
}
