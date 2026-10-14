import type { Dump, Item } from './schemas'

/** Events of the SSE stream from POST /api/dumps and POST /api/dumps/:id/rerun. */
export type OrganizeEvent =
  | { type: 'status'; phase: 'thinking' | 'writing'; model: string | null }
  | { type: 'meta'; title: string; summary: string }
  | { type: 'item'; item: Item }
  | { type: 'warning'; message: string }
  | { type: 'done'; dump: Dump }
  | { type: 'error'; message: string; dump: Dump | null }

export type StreamEvent = { type: 'dump'; dump: Dump } | OrganizeEvent
