import { addDays } from './dates'
import type { Item, Recurrence } from './schemas'

// iCalendar (RFC 5545) export. Times are "floating" (no time zone), so an event
// at 17:00 stays at 17:00 in the calendar app of the user.

const RRULE: Record<Recurrence, string> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
}

const TYPE_LABEL = { task: 'Task', idea: 'Idea', reminder: 'Reminder', question: 'Question' } as const

/** Escapes text values: backslash, semicolon, comma and newlines. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Folds a content line to 75 octets, as RFC 5545 asks (continuation lines start with a space). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74
    if (encoder.encode(current + char).length > limit) {
      parts.push(current)
      current = char
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compactDate = (iso: string) => iso.replaceAll('-', '')
const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, m] = time.split(':').map(Number) as [number, number]
  const total = h * 60 + m + minutes
  const dayShift = Math.floor(total / (24 * 60))
  const rest = total - dayShift * 24 * 60
  return {
    date: addDays(date, dayShift),
    time: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`,
  }
}

/** Open items with a due date become events. Returns the .ics text and the number of events. */
export function toIcs(items: Item[], exportedAt: Date): { text: string; count: number } {
  const events = items.filter((item) => item.status === 'open' && item.dueDate)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sift//Brain dump organizer//EN', 'CALSCALE:GREGORIAN']

  for (const item of events) {
    const date = item.dueDate!
    const description = [
      item.details,
      `${TYPE_LABEL[item.type]} · ${item.priority} priority${item.dueSource === 'suggested' ? ' · date suggested by AI' : ''}`,
      item.subtasks.length ? item.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join('\n') : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    lines.push('BEGIN:VEVENT', `UID:${item.id}@sift`, `DTSTAMP:${utcStamp(exportedAt)}`)
    if (item.dueTime) {
      const end = addMinutes(date, item.dueTime, 30)
      lines.push(
        `DTSTART:${compactDate(date)}T${item.dueTime.replace(':', '')}00`,
        `DTEND:${compactDate(end.date)}T${end.time.replace(':', '')}00`,
      )
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(date, 1))}`)
    }
    lines.push(`SUMMARY:${escapeText(item.title)}`, `DESCRIPTION:${escapeText(description)}`)
    if (item.tags.length) lines.push(`CATEGORIES:${item.tags.map(escapeText).join(',')}`)
    if (item.recurrence) lines.push(`RRULE:${RRULE[item.recurrence]}`)
    if (item.priority === 'high') lines.push('PRIORITY:1')
    if (item.dueTime) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(item.title)}`, 'TRIGGER:-PT15M', 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return { text: lines.map(foldLine).join('\r\n') + '\r\n', count: events.length }
}
