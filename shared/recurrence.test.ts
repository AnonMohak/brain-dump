import { describe, expect, test } from 'bun:test'
import { nextDueDate, nextOccurrence } from './recurrence'

describe('nextOccurrence', () => {
  test('daily, weekly, yearly', () => {
    expect(nextOccurrence('2026-12-31', 'daily')).toBe('2027-01-01')
    expect(nextOccurrence('2026-10-14', 'weekly')).toBe('2026-10-21')
    expect(nextOccurrence('2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  test('monthly keeps the day where it can', () => {
    expect(nextOccurrence('2026-10-01', 'monthly')).toBe('2026-11-01')
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(nextOccurrence('2026-12-15', 'monthly')).toBe('2027-01-15')
  })
})

describe('nextDueDate', () => {
  test('skips forward past today for an old item', () => {
    expect(nextDueDate('2026-10-01', 'monthly', '2026-10-14')).toBe('2026-11-01')
    expect(nextDueDate('2026-07-31', 'monthly', '2026-10-14')).toBe('2026-10-31')
    expect(nextDueDate('2026-10-01', 'weekly', '2026-10-14')).toBe('2026-10-15')
  })

  test('a date in the future moves one step', () => {
    expect(nextDueDate('2026-10-20', 'daily', '2026-10-14')).toBe('2026-10-21')
  })
})
