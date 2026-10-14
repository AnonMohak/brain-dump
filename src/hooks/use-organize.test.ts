import { expect, test } from 'bun:test'
import { sortedMessage } from './use-organize'

test('sortedMessage', () => {
  expect(sortedMessage(4, 0)).toBe('Sorted into 4 items')
  expect(sortedMessage(1, 0)).toBe('Sorted into 1 item')
  expect(sortedMessage(3, 2)).toBe('Sorted into 3 new items, updated 2')
  expect(sortedMessage(0, 1)).toBe('Updated 1 existing item')
})
