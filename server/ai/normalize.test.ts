import { describe, expect, test } from 'bun:test'
import { normalizeItem, parseAiObject, verifyQuote, type NormalizeContext } from './normalize'
import type { AiItemLine } from './schema'

const RAW = 'Tooth still hurts,  need to call DENTIST. Maybe a podcast someday. Rent due on the 1st!!'

function ctx(): NormalizeContext {
  return { today: '2026-10-14', rawText: RAW, dumpId: 'd1', seen: new Set() }
}

function item(fields: Record<string, unknown>): AiItemLine {
  const line = parseAiObject({ kind: 'item', title: 'Do it', type: 'task', ...fields })
  if (!line || line.kind !== 'item') throw new Error('not an item')
  return line
}

describe('parseAiObject', () => {
  test('accepts small mistakes in case and missing fields', () => {
    const line = parseAiObject({ type: 'Task', title: ' Call the dentist ', priority: 'HIGH' })
    expect(line).toMatchObject({
      kind: 'item',
      type: 'task',
      title: 'Call the dentist',
      priority: 'high',
      due: null,
      tags: [],
      subtasks: [],
      quote: null,
      details: null,
    })
  })

  test('replaces a bad priority or a bad date instead of dropping the item', () => {
    const line = parseAiObject({
      kind: 'item',
      type: 'task',
      title: 'X',
      priority: 'urgent',
      due: { date: 'next friday', source: 'stated' },
    })
    expect(line).toMatchObject({ priority: 'medium', due: null })
  })

  test('reads the meta line, also without "kind"', () => {
    expect(parseAiObject({ title: 'Busy week', summary: 'Lots to do.' })).toEqual({
      kind: 'meta',
      title: 'Busy week',
      summary: 'Lots to do.',
    })
  })

  test('rejects objects that are not items', () => {
    expect(parseAiObject({ kind: 'item', type: 'chore', title: 'X' })).toBeNull()
    expect(parseAiObject({ kind: 'item', type: 'task', title: '' })).toBeNull()
    expect(parseAiObject(undefined)).toBeNull()
    expect(parseAiObject('text')).toBeNull()
  })
})

describe('verifyQuote', () => {
  test('keeps quotes found in the dump, ignoring case, spacing and quote marks', () => {
    expect(verifyQuote(RAW, 'need to call dentist')).toBe('need to call dentist')
    expect(verifyQuote(RAW, '"...Tooth still hurts, need to call DENTIST..."')).toBe(
      'Tooth still hurts, need to call DENTIST',
    )
  })

  test('drops invented quotes', () => {
    expect(verifyQuote(RAW, 'buy a new car')).toBeNull()
    expect(verifyQuote(RAW, null)).toBeNull()
    expect(verifyQuote(RAW, '..')).toBeNull()
  })
})

describe('normalizeItem', () => {
  test('a task without a date gets a suggested date from its priority', () => {
    const c = ctx()
    expect(normalizeItem(item({ priority: 'high' }), c)).toMatchObject({
      dueDate: '2026-10-15',
      dueSource: 'suggested',
    })
    expect(normalizeItem(item({ title: 'B', priority: 'medium' }), c)?.dueDate).toBe('2026-10-19')
    expect(normalizeItem(item({ title: 'C', type: 'reminder', priority: 'low' }), c)?.dueDate).toBe(
      '2026-10-28',
    )
  })

  test('a suggested date in the past moves to today; a stated past date stays', () => {
    const c = ctx()
    const suggested = item({ due: { date: '2026-10-01', source: 'suggested' } })
    expect(normalizeItem(suggested, c)?.dueDate).toBe('2026-10-14')
    const stated = item({ title: 'B', due: { date: '2026-10-01', source: 'stated' } })
    expect(normalizeItem(stated, c)).toMatchObject({ dueDate: '2026-10-01', dueSource: 'stated' })
  })

  test('ideas and questions keep only stated dates', () => {
    const c = ctx()
    const idea = item({ type: 'idea', due: { date: '2026-10-20', source: 'suggested' } })
    expect(normalizeItem(idea, c)).toMatchObject({ dueDate: null, dueSource: null })
    const question = item({
      type: 'question',
      title: 'Q?',
      due: { date: '2026-10-16', time: '17:00', source: 'stated' },
    })
    expect(normalizeItem(question, c)).toMatchObject({
      dueDate: '2026-10-16',
      dueTime: '17:00',
      dueSource: 'stated',
    })
  })

  test('normalizes tags, checks the quote and drops duplicates', () => {
    const c = ctx()
    const first = normalizeItem(
      item({ title: 'Call  the dentist', tags: ['#Health', 'Self Care'], quote: 'call dentist' }),
      c,
    )
    expect(first).toMatchObject({
      title: 'Call the dentist',
      tags: ['health', 'self-care'],
      sourceQuote: 'call dentist',
      dumpId: 'd1',
    })
    expect(normalizeItem(item({ title: 'call the DENTIST' }), c)).toBeNull()
  })
})

describe('dateGuide', () => {
  test('lists tomorrow, the next weekdays and next week', async () => {
    const { dateGuide } = await import('./prompt')
    const guide = dateGuide({ date: '2026-10-14', time: '09:00', weekday: 'Wednesday', timeZone: 'UTC' })
    expect(guide).toContain('today = 2026-10-14 (Wednesday)')
    expect(guide).toContain('tomorrow = 2026-10-15')
    expect(guide).toContain('next Friday = 2026-10-16')
    expect(guide).toContain('next Tuesday = 2026-10-20')
    expect(guide).toContain('next Wednesday = 2026-10-21')
    expect(guide).toContain('next week (Monday) = 2026-10-19')
    expect(guide).toContain('in 2 weeks = 2026-10-28')
  })
})

describe('repeat', () => {
  test('keeps a repeat only for items with a date', () => {
    const c = ctx()
    expect(normalizeItem(item({ title: 'Rent', type: 'reminder', repeat: 'Monthly', due: { date: '2026-11-01', source: 'stated' } }), c)?.recurrence).toBe('monthly')
    expect(normalizeItem(item({ title: 'Idea', type: 'idea', repeat: 'weekly' }), c)?.recurrence).toBeNull()
    expect(normalizeItem(item({ title: 'Bad', repeat: 'fortnightly' }), c)?.recurrence).toBeNull()
  })
})
