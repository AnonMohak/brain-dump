import { describe, expect, test } from 'bun:test'
import { alignToDays, describeRepeat, nextDueDate, nextOccurrence, toRrule, weekdayOf } from './recurrence'

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

describe('weekly with weekdays', () => {
  const MWF = ['mon', 'wed', 'fri'] as const

  test('weekdayOf', () => {
    expect(weekdayOf('2026-10-14')).toBe('wed')
    expect(weekdayOf('2026-10-18')).toBe('sun')
    expect(weekdayOf('2026-10-19')).toBe('mon')
  })

  test('done moves to the next listed weekday: Mon -> Wed -> Fri -> Mon', () => {
    expect(nextOccurrence('2026-10-19', 'weekly', undefined, MWF)).toBe('2026-10-21')
    expect(nextOccurrence('2026-10-21', 'weekly', undefined, MWF)).toBe('2026-10-23')
    expect(nextOccurrence('2026-10-23', 'weekly', undefined, MWF)).toBe('2026-10-26')
    // Across a month and a year end
    expect(nextOccurrence('2026-12-31', 'weekly', undefined, ['mon'])).toBe('2027-01-04')
  })

  test('without days, weekly is +7 days as before', () => {
    expect(nextOccurrence('2026-10-14', 'weekly', undefined, null)).toBe('2026-10-21')
  })

  test('an overdue item jumps to the next listed day that is not before today', () => {
    // Due Mon Oct 5, today is Wed Oct 14: the next listed day on or after today is Wed Oct 14.
    expect(nextDueDate('2026-10-05', 'weekly', '2026-10-14', MWF)).toBe('2026-10-14')
    expect(nextDueDate('2026-10-05', 'weekly', '2026-10-15', MWF)).toBe('2026-10-16')
  })

  test('alignToDays moves a date onto a listed day', () => {
    expect(alignToDays('2026-10-14', MWF)).toBe('2026-10-14')
    expect(alignToDays('2026-10-15', MWF)).toBe('2026-10-16')
    expect(alignToDays('2026-10-17', ['mon'])).toBe('2026-10-19')
    expect(alignToDays('2026-10-17', [])).toBe('2026-10-17')
  })

  test('describeRepeat and toRrule', () => {
    expect(describeRepeat('weekly', MWF)).toBe('Mon, Wed, Fri')
    expect(describeRepeat('weekly', ['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Weekdays')
    expect(describeRepeat('weekly', ['sun', 'sat'])).toBe('Weekends')
    expect(describeRepeat('weekly', null)).toBe('Weekly')
    expect(describeRepeat('monthly', MWF)).toBe('Monthly')
    expect(toRrule('weekly', ['fri', 'mon', 'wed'])).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(toRrule('monthly')).toBe('FREQ=MONTHLY')
  })
})
