import { normalizeTag, type CreateItemInput, type Item, type UpdateItemInput } from '@shared/schemas'
import { toLocalIsoDate } from '@shared/dates'
import { isRecurring, nextDueDate } from '@shared/recurrence'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const itemsKey = ['items'] as const
export const dumpsKey = ['dumps'] as const

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 })
}

export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: Infinity, retry: 1 })
}

export function useItems() {
  return useQuery({ queryKey: itemsKey, queryFn: api.items })
}

export function useDumps() {
  return useQuery({ queryKey: dumpsKey, queryFn: api.dumps })
}

/** The optimistic version of a PATCH, so the UI reacts at once. */
function applyPatch(item: Item, patch: UpdateItemInput): Item {
  const next: Item = { ...item }
  if (patch.type !== undefined) next.type = patch.type
  if (patch.title !== undefined) next.title = patch.title.trim()
  if (patch.details !== undefined) next.details = patch.details?.trim() || null
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.position !== undefined) next.position = patch.position
  if (patch.tags !== undefined) next.tags = [...new Set(patch.tags.map(normalizeTag).filter(Boolean))]
  if (patch.dueDate !== undefined) {
    next.dueDate = patch.dueDate
    next.dueSource = patch.dueSource ?? (patch.dueDate ? 'stated' : null)
    if (!patch.dueDate) next.dueTime = null
  }
  if (patch.dueTime !== undefined && next.dueDate) next.dueTime = patch.dueTime
  if (patch.recurrence !== undefined) next.recurrence = patch.recurrence
  if (patch.status === 'done' && item.status === 'open' && isRecurring(next) && patch.dueDate === undefined) {
    // Same rule as the server: a repeating item moves to its next date.
    next.dueDate = nextDueDate(next.dueDate!, next.recurrence!, toLocalIsoDate(new Date()))
    next.subtasks = next.subtasks.map((s) => ({ ...s, done: false }))
  } else if (patch.status !== undefined && patch.status !== item.status) {
    next.status = patch.status
    next.completedAt = patch.status === 'done' ? new Date().toISOString() : null
  }
  if (patch.subtasks !== undefined) {
    next.subtasks = patch.subtasks.map((s, index) => ({
      id: s.id ?? `temp-${index}`,
      text: s.text,
      done: s.done ?? false,
      position: index,
    }))
  }
  return next
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateItemInput }) => api.updateItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: itemsKey })
      const previous = qc.getQueryData<Item[]>(itemsKey)
      qc.setQueryData<Item[]>(itemsKey, (items) =>
        items?.map((item) => (item.id === id ? applyPatch(item, patch) : item)),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(itemsKey, context.previous)
      toast.error(error.message)
    },
    onSuccess: (saved) => {
      qc.setQueryData<Item[]>(itemsKey, (items) =>
        items?.map((item) => (item.id === saved.id ? saved : item)),
      )
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateItemInput) => api.createItem(input),
    onSuccess: (item) => {
      qc.setQueryData<Item[]>(itemsKey, (items) => [...(items ?? []), item])
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: itemsKey })
      const previous = qc.getQueryData<Item[]>(itemsKey)
      qc.setQueryData<Item[]>(itemsKey, (items) => items?.filter((item) => item.id !== id))
      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) qc.setQueryData(itemsKey, context.previous)
      toast.error(error.message)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: dumpsKey }),
  })
}

export function useDeleteDump() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteDump(id),
    onSuccess: (_result, id) => {
      qc.setQueryData<Item[]>(itemsKey, (items) => items?.filter((item) => item.dumpId !== id))
      qc.invalidateQueries({ queryKey: dumpsKey })
    },
    onError: (error) => toast.error(error.message),
  })
}
