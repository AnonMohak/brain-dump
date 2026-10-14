import { describe, expect, test } from 'bun:test'
import { addDays, daysBetween, dueState, formatDue, localNow, safeTimeZone, snoozeTargets } from './dates'

describe('localNow', () => {
  test('gives the date and weekday in the user time zone', () => {
    // 2026-10-14 23:30 UTC is already 2026-10-15 in Kolkata (UTC+5:30).
    const now = new Date('2026-10-14T23:30:00Z')
    expect(localNow(now, 'Asia/Kolkata')).toEqual({
      date: '2026-10-15',
      time: '05:00',
      weekday: 'Thursday',
      timeZone: 'Asia/Kolkata',
    })
    expect(localNow(now, 'America/New_York').date).toBe('2026-10-14')
  })

  test('falls back to UTC for an unknown time zone', () => {
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC')
    expect(localNow(new Date('2026-01-01T00:00:00Z'), 'Mars/Olympus').timeZone).toBe('UTC')
  })
})

describe('date math', () => {
  test('addDays crosses months and years', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  test('daysBetween counts calendar days', () => {
    expect(daysBetween('2026-10-14', '2026-10-21')).toBe(7)
    expect(daysBetween('2026-10-14', '2026-10-13')).toBe(-1)
  })
})

describe('dueState', () => {
  // Local time, so the tests work in every time zone.
  const now = new Date(2026, 9, 14, 12, 0)

  test('overdue, soon and later', () => {
    expect(dueState({ dueDate: '2026-10-13', dueTime: null, status: 'open' }, now)).toBe('overdue')
    expect(dueState({ dueDate: '2026-10-14', dueTime: '09:00', status: 'open' }, now)).toBe('overdue')
    expect(dueState({ dueDate: '2026-10-14', dueTime: null, status: 'open' }, now)).toBe('soon')
    expect(dueState({ dueDate: '2026-10-15', dueTime: '11:00', status: 'open' }, now)).toBe('soon')
    expect(dueState({ dueDate: '2026-10-16', dueTime: null, status: 'open' }, now)).toBe('later')
  })

  test('done items and items without a date have no state', () => {
    expect(dueState({ dueDate: '2026-10-01', dueTime: null, status: 'done' }, now)).toBeNull()
    expect(dueState({ dueDate: null, dueTime: null, status: 'open' }, now)).toBeNull()
  })
})

describe('formatDue', () => {
  const now = new Date(2026, 9, 14, 12, 0) // Wednesday

  test('uses friendly words near today', () => {
    expect(formatDue('2026-10-14', null, now)).toBe('Today')
    expect(formatDue('2026-10-15', '17:00', now)).toBe('Tomorrow 17:00')
    expect(formatDue('2026-10-13', null, now)).toBe('Yesterday')
    expect(formatDue('2026-10-16', null, now)).toBe('Fri')
  })

  test('uses month and day further away', () => {
    expect(formatDue('2026-11-01', null, now)).toBe('Nov 1')
    expect(formatDue('2027-01-05', null, now)).toBe('Jan 5, 2027')
  })
})

describe('snoozeTargets', () => {
  const pick = (now: Date) => Object.fromEntries(snoozeTargets(now).map((t) => [t.key, t.date]))

  test('from a Wednesday', () => {
    expect(pick(new Date(2026, 9, 14, 9))).toEqual({
      tomorrow: '2026-10-15',
      weekend: '2026-10-17',
      'next-week': '2026-10-19',
      'two-weeks': '2026-10-28',
    })
  })

  test('from a Saturday and a Sunday, the weekend is the next one', () => {
    expect(pick(new Date(2026, 9, 17, 9)).weekend).toBe('2026-10-24')
    expect(pick(new Date(2026, 9, 18, 9)).weekend).toBe('2026-10-24')
    expect(pick(new Date(2026, 9, 18, 9))['next-week']).toBe('2026-10-19')
  })
})
