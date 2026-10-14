import type { Item, UpdateItemInput } from '@shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { describeChange, inversePatch } from '@/lib/changes'
import { dumpsKey, itemsKey, useUpdateItem } from './use-data'

const UNDO_MS = 5000

/** Item changes with "Undo": updates are reversed with a PATCH, deletes wait before they reach the server. */
export function useItemActions() {
  const qc = useQueryClient()
  const update = useUpdateItem()
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const current = useCallback(
    (id: string) => qc.getQueryData<Item[]>(itemsKey)?.find((item) => item.id === id),
    [qc],
  )

  const updateItem = useCallback(
    (id: string, patch: UpdateItemInput, options: { silent?: boolean } = {}) => {
      const before = current(id)
      update.mutate({ id, patch })
      const message = options.silent || !before ? null : describeChange(patch)
      if (!message || !before) return
      const back = inversePatch(before, patch)
      toast(message, {
        description: before.title,
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => update.mutate({ id, patch: back }) },
      })
    },
    [current, update],
  )

  const commitDelete = useCallback(
    (id: string) => {
      pending.current.delete(id)
      api
        .deleteItem(id)
        .catch((error: Error) => {
          // 404 means it is already gone; anything else: show the item again.
          if (!/not found/i.test(error.message)) {
            toast.error(error.message)
            void qc.invalidateQueries({ queryKey: itemsKey })
          }
        })
        .finally(() => void qc.invalidateQueries({ queryKey: dumpsKey }))
    },
    [qc],
  )

  const deleteItem = useCallback(
    (id: string) => {
      const item = current(id)
      if (!item) return
      qc.setQueryData<Item[]>(itemsKey, (items) => items?.filter((i) => i.id !== id))
      pending.current.set(id, setTimeout(() => commitDelete(id), UNDO_MS))
      toast('Item deleted', {
        description: item.title,
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            clearTimeout(pending.current.get(id))
            pending.current.delete(id)
            qc.setQueryData<Item[]>(itemsKey, (items) => [...(items ?? []).filter((i) => i.id !== id), item])
          },
        },
      })
    },
    [current, qc, commitDelete],
  )

  // Send waiting deletes when the page closes, so they are not lost.
  useEffect(() => {
    const map = pending.current
    const flush = () => {
      for (const [id, timer] of map) {
        clearTimeout(timer)
        void fetch(`/api/items/${id}`, { method: 'DELETE', keepalive: true })
      }
      map.clear()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  return { updateItem, deleteItem }
}
