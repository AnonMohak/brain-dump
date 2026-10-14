import { describe, expect, test } from 'bun:test'
import type { Item } from '@shared/schemas'
import { describeChange, inversePatch } from './changes'

const item: Item = {
  id: 'a', dumpId: null, type: 'task', title: 'Call mom', details: null, priority: 'medium',
  dueDate: '2026-10-15', dueTime: '17:00', dueSource: 'suggested', recurrence: null, repeatDays: null, googleEventId: null, tags: ['family'], sourceQuote: null,
  status: 'open', position: 3, subtasks: [{ id: 's1', text: 'Find number', done: false, position: 0 }],
  createdAt: '', updatedAt: '', completedAt: null,
}

describe('inversePatch', () => {
  test('restores only the changed fields', () => {
    expect(inversePatch(item, { status: 'done' })).toEqual({ status: 'open' })
    expect(inversePatch(item, { type: 'idea', position: 9 })).toEqual({ type: 'task', position: 3 })
  })
  test('a date change restores time and source too', () => {
    expect(inversePatch(item, { dueDate: '2026-10-20', dueTime: null, dueSource: 'stated' })).toEqual({
      dueDate: '2026-10-15', dueTime: '17:00', dueSource: 'suggested',
    })
  })
  test('subtasks come back as input', () => {
    expect(inversePatch(item, { subtasks: [] })).toEqual({ subtasks: [{ id: 's1', text: 'Find number', done: false }] })
  })
})

describe('describeChange', () => {
  test('names the change, or stays quiet for small ones', () => {
    expect(describeChange({ status: 'done' })).toBe('Marked as done')
    expect(describeChange({ type: 'question', position: 1 })).toBe('Moved to Questions')
    expect(describeChange({ priority: 'high' })).toBe('Priority set to High')
    expect(describeChange({ position: 4 })).toBeNull()
    expect(describeChange({ title: 'x' })).toBeNull()
  })
})

describe('repeating items', () => {
  const rent = { ...item, title: 'Pay rent', dueDate: '2026-10-01', dueTime: null, dueSource: 'stated' as const, recurrence: 'monthly' as const }

  test('done shows the next date, and undo puts the old date back', () => {
    expect(describeChange({ status: 'done' }, rent, '2026-10-14')).toBe('Done. Next: Nov 1')
    expect(inversePatch(rent, { status: 'done' })).toEqual({
      dueDate: '2026-10-01',
      dueTime: null,
      dueSource: 'stated',
      subtasks: [{ id: 's1', text: 'Find number', done: false }],
    })
  })
})
