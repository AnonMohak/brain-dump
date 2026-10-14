import type { Dump, Item } from './schemas'

/** Events of the SSE stream from POST /api/dumps and POST /api/dumps/:id/rerun. */
export type OrganizeEvent =
  | { type: 'status'; phase: 'thinking' | 'writing'; model: string | null }
  | { type: 'meta'; title: string; summary: string }
  | { type: 'item'; item: Item }
  /** An existing item that the dump changed (merged instead of duplicated). */
  | { type: 'update'; item: Item }
  | { type: 'warning'; message: string }
  | { type: 'done'; dump: Dump; merged: number }
  | { type: 'error'; message: string; dump: Dump | null }

export type StreamEvent = { type: 'dump'; dump: Dump } | OrganizeEvent

export type TextMode = 'plan' | 'ask'

/** Events of the SSE stream from POST /api/ai/text (Plan my day, Ask the board). */
export type TextEvent =
  | { type: 'status'; model: string }
  | { type: 'text'; delta: string }
  | { type: 'done'; model: string }
  | { type: 'error'; message: string }
