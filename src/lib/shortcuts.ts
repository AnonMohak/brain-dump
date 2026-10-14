import { snoozeTargets } from '@shared/dates'
import type { Item, UpdateItemInput } from '@shared/schemas'

export const SHORTCUTS: { group: string; keys: string[]; label: string }[] = [
  { group: 'Anywhere', keys: ['N'], label: 'Write a new dump' },
  { group: 'Anywhere', keys: ['/'], label: 'Search items' },
  { group: 'Anywhere', keys: ['Ctrl', 'K'], label: 'Command palette' },
  { group: 'Anywhere', keys: ['Ctrl', 'Enter'], label: 'Organize the dump (in the input)' },
  { group: 'Anywhere', keys: ['?'], label: 'Show these shortcuts' },
  { group: 'On a card', keys: ['↑', '↓', '←', '→'], label: 'Move between cards and columns' },
  { group: 'On a card', keys: ['E'], label: 'Edit' },
  { group: 'On a card', keys: ['X'], label: 'Mark done / open' },
  { group: 'On a card', keys: ['1', '2', '3'], label: 'Priority high / medium / low' },
  { group: 'On a card', keys: ['S'], label: 'Snooze to tomorrow' },
  { group: 'On a card', keys: ['Delete'], label: 'Delete (with undo)' },
  { group: 'On a card', keys: ['Space'], label: 'Pick up to drag, then arrows and Space to drop' },
]

/** True when the key press belongs to a text field, so shortcuts must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]'))
}

export type CardCommand =
  | { kind: 'edit' }
  | { kind: 'delete' }
  | { kind: 'update'; patch: UpdateItemInput }
  | { kind: 'focus'; direction: 'up' | 'down' | 'left' | 'right' }

/** Maps a key on a focused card to a command. Keys with modifiers are ignored. */
export function cardCommand(key: string, item: Item, now: Date = new Date()): CardCommand | null {
  switch (key) {
    case 'e':
    case 'E':
      return { kind: 'edit' }
    case 'x':
    case 'X':
      return { kind: 'update', patch: { status: item.status === 'done' ? 'open' : 'done' } }
    case '1':
      return { kind: 'update', patch: { priority: 'high' } }
    case '2':
      return { kind: 'update', patch: { priority: 'medium' } }
    case '3':
      return { kind: 'update', patch: { priority: 'low' } }
    case 's':
    case 'S': {
      const tomorrow = snoozeTargets(now)[0]!.date
      return { kind: 'update', patch: { dueDate: tomorrow, dueTime: null, dueSource: 'stated' } }
    }
    case 'Delete':
    case 'Backspace':
      return { kind: 'delete' }
    case 'ArrowUp':
      return { kind: 'focus', direction: 'up' }
    case 'ArrowDown':
      return { kind: 'focus', direction: 'down' }
    case 'ArrowLeft':
      return { kind: 'focus', direction: 'left' }
    case 'ArrowRight':
      return { kind: 'focus', direction: 'right' }
    default:
      return null
  }
}

/** Moves keyboard focus to the next card, using the board's DOM order. */
export function focusNeighbor(from: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') {
  const columns = [...document.querySelectorAll<HTMLElement>('[data-board-column]')]
  const column = from.closest<HTMLElement>('[data-board-column]')
  if (!column) return
  const cardsOf = (col: Element) => [...col.querySelectorAll<HTMLElement>('[data-card-id]')]
  const cards = cardsOf(column)
  const index = cards.indexOf(from)

  if (direction === 'up' || direction === 'down') {
    cards[index + (direction === 'up' ? -1 : 1)]?.focus()
    return
  }
  let c = columns.indexOf(column)
  // Skip empty columns.
  while (true) {
    c += direction === 'left' ? -1 : 1
    const next = columns[c]
    if (!next) return
    const target = cardsOf(next)
    if (target.length) {
      target[Math.min(index, target.length - 1)]!.focus()
      return
    }
  }
}
