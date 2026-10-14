import { addDays } from './dates'
import { WEEKDAYS, type Item, type Recurrence, type Weekday } from './schemas'

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

/** The weekday of a "YYYY-MM-DD" date. */
export function weekdayOf(isoDate: string): Weekday {
  // getUTCDay: 0 = Sunday; WEEKDAYS starts on Monday.
  return WEEKDAYS[(new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7]!
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

/** The first date on or after `isoDate` that falls on one of `days`. */
export function alignToDays(isoDate: string, days: readonly Weekday[]): string {
  if (days.length === 0) return isoDate
  let date = isoDate
  for (let i = 0; i < 7 && !days.includes(weekdayOf(date)); i++) date = addDays(date, 1)
  return date
}

/**
 * The next date after `isoDate` for a recurrence. A weekly repeat with
 * `days` goes to the next listed weekday (Mon -> Wed -> Fri -> Mon).
 */
export function nextOccurrence(
  isoDate: string,
  recurrence: Recurrence,
  anchorDay?: number,
  days?: readonly Weekday[] | null,
): string {
  const day = anchorDay ?? Number(isoDate.slice(8, 10))
  switch (recurrence) {
    case 'daily':
      return addDays(isoDate, 1)
    case 'weekly':
      return days?.length ? alignToDays(addDays(isoDate, 1), days) : addDays(isoDate, 7)
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
export function nextDueDate(
  dueDate: string,
  recurrence: Recurrence,
  today: string,
  days?: readonly Weekday[] | null,
): string {
  const anchor = Number(dueDate.slice(8, 10))
  let next = nextOccurrence(dueDate, recurrence, anchor, days)
  for (let guard = 0; next < today && guard < 1000; guard++) next = nextOccurrence(next, recurrence, anchor, days)
  return next
}

/** True when marking this item done should move it to its next date instead. */
export function isRecurring(item: Pick<Item, 'recurrence' | 'dueDate'>): boolean {
  return Boolean(item.recurrence && item.dueDate)
}

/** "Daily", "Weekly", "Mon, Wed, Fri", "Weekdays", "Weekends", "Monthly", "Yearly". */
export function describeRepeat(recurrence: Recurrence, days?: readonly Weekday[] | null): string {
  if (recurrence !== 'weekly' || !days?.length) return RECURRENCE_LABEL[recurrence]
  const key = WEEKDAYS.filter((d) => days.includes(d)).join(',')
  if (key === 'mon,tue,wed,thu,fri') return 'Weekdays'
  if (key === 'sat,sun') return 'Weekends'
  if (key.split(',').length === 7) return 'Every day'
  return WEEKDAYS.filter((d) => days.includes(d)).map((d) => WEEKDAY_LABEL[d]).join(', ')
}

/** iCalendar RRULE value for a repeat. */
export function toRrule(recurrence: Recurrence, days?: readonly Weekday[] | null): string {
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[recurrence]
  if (recurrence !== 'weekly' || !days?.length) return `FREQ=${freq}`
  const byDay = WEEKDAYS.filter((d) => days.includes(d)).map((d) => d.slice(0, 2).toUpperCase())
  return `FREQ=WEEKLY;BYDAY=${byDay.join(',')}`
}
