import { dueMoment, formatDue, toLocalIsoDate } from '@shared/dates'
import { isRecurring, nextDueDate } from '@shared/recurrence'
import type { Item, UpdateItemInput } from '@shared/schemas'
import { PRIORITY_META, TYPE_META } from './items'

/** The patch that puts back the fields that `patch` changes. */
export function inversePatch(item: Item, patch: UpdateItemInput): UpdateItemInput {
  if (completesRecurring(item, patch)) {
    // The server moved the date instead of marking it done: put the date and steps back.
    return {
      dueDate: item.dueDate,
      dueTime: item.dueTime,
      dueSource: item.dueSource,
      subtasks: item.subtasks.map(({ id, text, done }) => ({ id, text, done })),
    }
  }
  const back: UpdateItemInput = {}
  for (const key of Object.keys(patch) as (keyof UpdateItemInput)[]) {
    if (key === 'subtasks') back.subtasks = item.subtasks.map(({ id, text, done }) => ({ id, text, done }))
    else (back as Record<string, unknown>)[key] = item[key]
  }
  if ('dueDate' in patch) {
    back.dueDate = item.dueDate
    back.dueTime = item.dueTime
    back.dueSource = item.dueSource
  }
  return back
}

/** A short toast text for a change, or null when the change is too small to announce. */
export function describeChange(patch: UpdateItemInput, item?: Item, today = toLocalIsoDate(new Date())): string | null {
  if (item && completesRecurring(item, patch)) {
    const next = nextDueDate(item.dueDate!, item.recurrence!, today, item.repeatDays)
    return `Done. Next: ${formatDue(next, item.dueTime, dueMoment(today, '12:00'))}`
  }
  if (patch.status === 'done') return 'Marked as done'
  if (patch.status === 'open') return 'Marked as open'
  if (patch.type) return `Moved to ${TYPE_META[patch.type].plural}`
  if (patch.priority) return `Priority set to ${PRIORITY_META[patch.priority].label}`
  if (patch.dueDate) return `Snoozed to ${formatDue(patch.dueDate, patch.dueTime ?? null)}`
  return null
}

/** Marking a repeating open item done moves it to its next date. */
function completesRecurring(item: Item, patch: UpdateItemInput): boolean {
  return patch.status === 'done' && item.status === 'open' && isRecurring(item) && patch.dueDate === undefined
}
