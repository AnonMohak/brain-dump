import { expect, test } from 'bun:test'
import type { Item } from './schemas'
import { todayGroups } from './today'

let n = 0
const make = (fields: Partial<Item>) => ({ id: `i${++n}`, status: 'open', dueTime: null, ...fields }) as Item

test('todayGroups splits open items by due day and sorts by time', () => {
  const now = new Date(2026, 9, 14, 12, 0) // Wed 12:00 local
  const items = [
    make({ id: 'late', dueDate: '2026-10-13' }),
    make({ id: 'morning', dueDate: '2026-10-14', dueTime: '09:00' }), // earlier today: overdue
    make({ id: 'evening', dueDate: '2026-10-14', dueTime: '18:00' }),
    make({ id: 'afternoon', dueDate: '2026-10-14', dueTime: '14:00' }),
    make({ id: 'allday', dueDate: '2026-10-14' }),
    make({ id: 'tomorrow', dueDate: '2026-10-15' }),
    make({ id: 'later', dueDate: '2026-10-20' }),
    make({ id: 'done', dueDate: '2026-10-14', status: 'done' }),
    make({ id: 'nodate', dueDate: null }),
  ]
  const groups = todayGroups(items, now)
  expect(groups.overdue.map((i) => i.id)).toEqual(['late', 'morning'])
  expect(groups.today.map((i) => i.id)).toEqual(['afternoon', 'evening', 'allday'])
  expect(groups.tomorrow.map((i) => i.id)).toEqual(['tomorrow'])
})
