import { addDays } from '../../shared/dates'
import { describeRepeat, toRrule } from '../../shared/recurrence'
import type { Item } from '../../shared/schemas'

/** The Google Calendar event (API v3 resource) for an item with a due date. */
export type CalendarEvent = {
  summary: string
  description: string
  start: { date: string } | { dateTime: string; timeZone: string }
  end: { date: string } | { dateTime: string; timeZone: string }
  recurrence?: string[]
  reminders: { useDefault: boolean; overrides?: { method: 'popup'; minutes: number }[] }
  colorId?: string
  extendedProperties: { private: { siftItemId: string } }
}

const TYPE_LABEL = { task: 'Task', idea: 'Idea', reminder: 'Reminder', question: 'Question' } as const
/** Google Calendar color ids: 11 = Tomato for high priority. Others keep the calendar color. */
const HIGH_PRIORITY_COLOR = '11'
const EVENT_MINUTES = 30

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

/**
 * Builds the event. Date-only items are all-day events; timed items are
 * 30-minute events in the user's time zone with a popup reminder.
 */
export function eventFromItem(item: Item, timeZone: string, reminderMinutes: number): CalendarEvent {
  if (!item.dueDate) throw new Error('An event needs a due date')

  const description = [
    item.details,
    item.subtasks.length ? item.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.text}`).join('\n') : null,
    [
      `${TYPE_LABEL[item.type]} · ${item.priority} priority`,
      item.dueSource === 'suggested' ? 'date suggested by AI' : null,
      item.recurrence ? `repeats ${describeRepeat(item.recurrence, item.repeatDays).toLowerCase()}` : null,
      item.tags.length ? item.tags.map((t) => `#${t}`).join(' ') : null,
    ]
      .filter(Boolean)
      .join(' · '),
    'Added by Sift',
  ]
    .filter(Boolean)
    .join('\n\n')

  const timed = Boolean(item.dueTime)
  const end = timed ? addMinutes(item.dueDate, item.dueTime!, EVENT_MINUTES) : null

  return {
    summary: item.title,
    description,
    start: timed
      ? { dateTime: `${item.dueDate}T${item.dueTime}:00`, timeZone }
      : { date: item.dueDate },
    end: timed ? { dateTime: `${end!.date}T${end!.time}:00`, timeZone } : { date: addDays(item.dueDate, 1) },
    ...(item.recurrence ? { recurrence: [`RRULE:${toRrule(item.recurrence, item.repeatDays)}`] } : {}),
    reminders:
      timed && reminderMinutes > 0
        ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMinutes }] }
        : { useDefault: true },
    ...(item.priority === 'high' ? { colorId: HIGH_PRIORITY_COLOR } : {}),
    extendedProperties: { private: { siftItemId: item.id } },
  }
}
