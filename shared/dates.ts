// Date helpers shared by the server (AI fix-ups) and the browser (badges, labels).
// Dates are "YYYY-MM-DD" strings and times are "HH:mm" strings, in the user's local time.

const DAY_MS = 24 * 60 * 60 * 1000

export function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

export type LocalNow = { date: string; time: string; weekday: string; timeZone: string }

/** The calendar date, clock time and weekday of `now` in a time zone. */
export function localNow(now: Date, timeZone: string): LocalNow {
  const zone = safeTimeZone(timeZone)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'long',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday ?? '',
    timeZone: zone,
  }
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** "YYYY-MM-DD" of a Date in the runtime's local time zone. */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The due moment in local time. A date without a time is due at the end of that day. */
export function dueMoment(dueDate: string, dueTime: string | null): Date {
  const [y, m, d] = dueDate.split('-').map(Number) as [number, number, number]
  if (dueTime) {
    const [h, min] = dueTime.split(':').map(Number) as [number, number]
    return new Date(y, m - 1, d, h, min)
  }
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

export type DueState = 'overdue' | 'soon' | 'later'

/** "soon" means due within the next 24 hours. Done items have no due state. */
export function dueState(
  item: { dueDate: string | null; dueTime: string | null; status: string },
  now: Date = new Date(),
): DueState | null {
  if (!item.dueDate || item.status === 'done') return null
  const diff = dueMoment(item.dueDate, item.dueTime).getTime() - now.getTime()
  if (diff < 0) return 'overdue'
  if (diff <= DAY_MS) return 'soon'
  return 'later'
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** Short label: "Today", "Tomorrow", "Yesterday", "Fri", "Oct 24", "Oct 24, 2027", plus " 14:00". */
export function formatDue(dueDate: string, dueTime: string | null, now: Date = new Date()): string {
  const days = daysBetween(toLocalIsoDate(now), dueDate)
  const date = dueMoment(dueDate, null)
  let label: string
  if (days === 0) label = 'Today'
  else if (days === 1) label = 'Tomorrow'
  else if (days === -1) label = 'Yesterday'
  else if (days > 1 && days < 7) label = WEEKDAY.format(date)
  else if (date.getFullYear() === now.getFullYear()) label = MONTH_DAY.format(date)
  else label = MONTH_DAY_YEAR.format(date)
  return dueTime ? `${label} ${dueTime}` : label
}

export type SnoozeTarget = { key: 'tomorrow' | 'weekend' | 'next-week' | 'two-weeks'; label: string; date: string }

/** Quick dates for "Snooze", in the runtime's local time. */
export function snoozeTargets(now: Date = new Date()): SnoozeTarget[] {
  const today = toLocalIsoDate(now)
  const day = now.getDay() // 0 = Sunday
  const toSaturday = day === 6 ? 7 : (6 - day + 7) % 7 || 7
  const toMonday = ((8 - day) % 7) || 7
  return [
    { key: 'tomorrow', label: 'Tomorrow', date: addDays(today, 1) },
    { key: 'weekend', label: 'This weekend', date: addDays(today, day === 0 ? 6 : toSaturday) },
    { key: 'next-week', label: 'Next week', date: addDays(today, toMonday) },
    { key: 'two-weeks', label: 'In 2 weeks', date: addDays(today, 14) },
  ]
}
