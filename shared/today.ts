import { addDays, dueMoment, toLocalIsoDate } from './dates'
import type { Item } from './schemas'

export type TodayGroups = { overdue: Item[]; today: Item[]; tomorrow: Item[] }

/** Open items that are overdue, due today or due tomorrow, each group sorted by due time. */
export function todayGroups(items: Item[], now: Date = new Date()): TodayGroups {
  const today = toLocalIsoDate(now)
  const tomorrow = addDays(today, 1)
  const groups: TodayGroups = { overdue: [], today: [], tomorrow: [] }
  for (const item of items) {
    if (item.status !== 'open' || !item.dueDate) continue
    const moment = dueMoment(item.dueDate, item.dueTime)
    if (moment < now) groups.overdue.push(item)
    else if (item.dueDate === today) groups.today.push(item)
    else if (item.dueDate === tomorrow) groups.tomorrow.push(item)
  }
  const byDue = (a: Item, b: Item) =>
    dueMoment(a.dueDate!, a.dueTime).getTime() - dueMoment(b.dueDate!, b.dueTime).getTime()
  groups.overdue.sort(byDue)
  groups.today.sort(byDue)
  groups.tomorrow.sort(byDue)
  return groups
}
