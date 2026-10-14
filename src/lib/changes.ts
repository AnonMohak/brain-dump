import { formatDue } from '@shared/dates'
import type { Item, UpdateItemInput } from '@shared/schemas'
import { PRIORITY_META, TYPE_META } from './items'

/** The patch that puts back the fields that `patch` changes. */
export function inversePatch(item: Item, patch: UpdateItemInput): UpdateItemInput {
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
export function describeChange(patch: UpdateItemInput): string | null {
  if (patch.status === 'done') return 'Marked as done'
  if (patch.status === 'open') return 'Marked as open'
  if (patch.type) return `Moved to ${TYPE_META[patch.type].plural}`
  if (patch.priority) return `Priority set to ${PRIORITY_META[patch.priority].label}`
  if (patch.dueDate) return `Snoozed to ${formatDue(patch.dueDate, patch.dueTime ?? null)}`
  return null
}
