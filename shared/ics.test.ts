import { describe, expect, test } from 'bun:test'
import { escapeText, foldLine, toIcs } from './ics'
import type { Item } from './schemas'

const base: Item = {
  id: 'x', dumpId: null, type: 'task', title: 'T', details: null, priority: 'medium',
  dueDate: null, dueTime: null, dueSource: null, recurrence: null, tags: [], sourceQuote: null,
  status: 'open', position: 0, subtasks: [], createdAt: '', updatedAt: '', completedAt: null,
}
const at = new Date('2026-10-14T08:30:00Z')

describe('toIcs', () => {
  test('all-day, timed and repeating events; done and undated items are left out', () => {
    const { text, count } = toIcs(
      [
        { ...base, id: 'a', title: 'Pay rent; now, please', dueDate: '2026-11-01', recurrence: 'monthly', priority: 'high', tags: ['money'] },
        { ...base, id: 'b', type: 'reminder', title: 'Dentist', dueDate: '2026-10-16', dueTime: '23:45', details: 'Bring the card' },
        { ...base, id: 'c', title: 'No date' },
        { ...base, id: 'd', title: 'Done', dueDate: '2026-10-15', status: 'done' },
      ],
      at,
    )
    expect(count).toBe(2)
    const lines = text.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(lines).toContain('UID:a@sift')
    expect(lines).toContain('DTSTAMP:20261014T083000Z')
    expect(lines).toContain('DTSTART;VALUE=DATE:20261101')
    expect(lines).toContain('DTEND;VALUE=DATE:20261102')
    expect(lines).toContain('SUMMARY:Pay rent\\; now\\, please')
    expect(lines).toContain('RRULE:FREQ=MONTHLY')
    expect(lines).toContain('PRIORITY:1')
    expect(lines).toContain('CATEGORIES:money')
    // A timed event that crosses midnight
    expect(lines).toContain('DTSTART:20261016T234500')
    expect(lines).toContain('DTEND:20261017T001500')
    expect(lines).toContain('TRIGGER:-PT15M')
    expect(text).toContain('DESCRIPTION:Bring the card\\n\\nReminder · medium priority')
    expect(text).not.toContain('No date')
    expect(text).not.toContain('SUMMARY:Done')
  })
})

describe('helpers', () => {
  test('escapeText', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })

  test('foldLine keeps lines within 75 octets', () => {
    const long = `SUMMARY:${'ü'.repeat(60)}`
    const folded = foldLine(long)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(long)
  })
})
