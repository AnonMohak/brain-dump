import { describe, expect, test } from 'bun:test'
import type { Item } from '@shared/schemas'
import { cardCommand } from './shortcuts'

const item = { id: 'a', status: 'open' } as Item

describe('cardCommand', () => {
  test('maps keys to card actions', () => {
    expect(cardCommand('e', item)).toEqual({ kind: 'edit' })
    expect(cardCommand('x', item)).toEqual({ kind: 'update', patch: { status: 'done' } })
    expect(cardCommand('X', { ...item, status: 'done' })).toEqual({ kind: 'update', patch: { status: 'open' } })
    expect(cardCommand('1', item)).toEqual({ kind: 'update', patch: { priority: 'high' } })
    expect(cardCommand('3', item)).toEqual({ kind: 'update', patch: { priority: 'low' } })
    expect(cardCommand('Delete', item)).toEqual({ kind: 'delete' })
    expect(cardCommand('ArrowLeft', item)).toEqual({ kind: 'focus', direction: 'left' })
  })

  test('S snoozes to tomorrow', () => {
    expect(cardCommand('s', item, new Date(2026, 9, 14, 9))).toEqual({
      kind: 'update',
      patch: { dueDate: '2026-10-15', dueTime: null, dueSource: 'stated' },
    })
  })

  test('other keys do nothing (Space and Enter stay with drag and drop)', () => {
    expect(cardCommand(' ', item)).toBeNull()
    expect(cardCommand('Enter', item)).toBeNull()
    expect(cardCommand('q', item)).toBeNull()
  })
})
