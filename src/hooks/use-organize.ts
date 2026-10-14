import type { StreamEvent } from '@shared/events'
import type { Dump, Item } from '@shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { postStream } from '@/lib/sse'
import { dumpsKey, itemsKey } from './use-data'

export type OrganizePhase = 'idle' | 'starting' | 'thinking' | 'writing'

export type OrganizeState = {
  phase: OrganizePhase
  dumpId: string | null
  model: string | null
  title: string | null
  startedAt: number | null
  count: number
  /** Items that arrived in this run. They animate in. */
  fresh: ReadonlySet<string>
}

const IDLE: OrganizeState = {
  phase: 'idle',
  dumpId: null,
  model: null,
  title: null,
  startedAt: null,
  count: 0,
  fresh: new Set(),
}

/** "Sorted into 4 items", "Sorted into 3 new items, updated 2", "Updated 1 existing item". */
export function sortedMessage(created: number, merged: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (merged === 0) return `Sorted into ${plural(created, 'item')}`
  if (created === 0) return `Updated ${plural(merged, 'existing item')}`
  return `Sorted into ${plural(created, 'new item')}, updated ${merged}`
}

function clientClock() {
  return {
    now: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

/** Runs one AI organize stream at a time and feeds its items into the query cache. */
export function useOrganize() {
  const qc = useQueryClient()
  const [state, setState] = useState<OrganizeState>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)

  const upsertDump = useCallback(
    (dump: Dump) =>
      qc.setQueryData<Dump[]>(dumpsKey, (dumps) => [dump, ...(dumps ?? []).filter((d) => d.id !== dump.id)]),
    [qc],
  )

  const run = useCallback(
    async (path: string, body: object): Promise<boolean> => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setState({ ...IDLE, phase: 'starting', startedAt: Date.now(), fresh: new Set() })

      let succeeded = false
      const onEvent = (event: StreamEvent) => {
        switch (event.type) {
          case 'dump':
            upsertDump(event.dump)
            setState((s) => ({ ...s, dumpId: event.dump.id }))
            break
          case 'status':
            setState((s) => ({ ...s, phase: event.phase, model: event.model ?? s.model }))
            break
          case 'meta':
            setState((s) => ({ ...s, title: event.title }))
            break
          case 'item': {
            const item: Item = event.item
            qc.setQueryData<Item[]>(itemsKey, (items) => [
              ...(items ?? []).filter((i) => i.id !== item.id),
              item,
            ])
            setState((s) => ({ ...s, count: s.count + 1, fresh: new Set(s.fresh).add(item.id) }))
            break
          }
          case 'update': {
            const updated: Item = event.item
            qc.setQueryData<Item[]>(itemsKey, (items) =>
              (items ?? []).map((i) => (i.id === updated.id ? updated : i)),
            )
            setState((s) => ({ ...s, fresh: new Set(s.fresh).add(updated.id) }))
            break
          }
          case 'warning':
            toast.warning(event.message)
            break
          case 'done':
            succeeded = true
            upsertDump(event.dump)
            toast.success(sortedMessage(event.dump.itemCount, event.merged), {
              description: event.dump.title ?? undefined,
            })
            break
          case 'error':
            if (event.dump) upsertDump(event.dump)
            toast.error(event.message)
            break
        }
      }

      try {
        await postStream<StreamEvent>(path, body, onEvent, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) toast('Stopped. The items that arrived are kept.')
        else toast.error((error as Error).message)
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
        setState((s) => ({ ...s, phase: 'idle' }))
        // Sync with the server; the fresh items stay marked for their entry animation.
        void qc.invalidateQueries({ queryKey: dumpsKey })
        void qc.invalidateQueries({ queryKey: itemsKey })
        setTimeout(() => setState((s) => (s.phase === 'idle' ? { ...s, fresh: new Set() } : s)), 1500)
      }
      return succeeded
    },
    [qc, upsertDump],
  )

  const organize = useCallback(
    (text: string) => run('/dumps', { text, ...clientClock() }),
    [run],
  )

  const rerun = useCallback(
    (dumpId: string) => {
      // The server deletes the old items of this dump first.
      qc.setQueryData<Item[]>(itemsKey, (items) => items?.filter((i) => i.dumpId !== dumpId))
      return run(`/dumps/${dumpId}/rerun`, clientClock())
    },
    [qc, run],
  )

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  return { state, busy: state.phase !== 'idle', organize, rerun, cancel }
}
