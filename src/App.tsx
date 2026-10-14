import type { UpdateItemInput } from '@shared/schemas'
import { Loader2, ServerCrash } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Board } from '@/components/board'
import { DumpInput } from '@/components/dump-input'
import { LoginScreen } from '@/components/login-screen'
import { useDeleteItem, useHealth, useItems, useSession, useUpdateItem } from '@/hooks/use-data'
import { useOrganize } from '@/hooks/use-organize'
import { EXAMPLE_DUMP } from '@/lib/example'
import { isUrgent } from '@/lib/items'

export default function App() {
  const session = useSession()

  if (session.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (session.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <ServerCrash className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">The Sift server does not respond.</p>
        <p className="text-xs text-muted-foreground">
          Start it with <code className="font-mono">bun run dev</code>, then reload this page.
        </p>
      </div>
    )
  }
  if (session.data.required && !session.data.authenticated) return <LoginScreen />
  return <Workspace />
}

const DRAFT_KEY = 'sift:draft'

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

function Workspace() {
  const items = useItems()
  const health = useHealth()
  const organizer = useOrganize()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const [text, setText] = useState(readDraft)

  // Keep an unsent draft across reloads.
  useEffect(() => {
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text)
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* storage is optional */
    }
  }, [text])

  const allItems = useMemo(() => items.data ?? [], [items.data])
  const urgentCount = useMemo(
    () => allItems.filter((item) => isUrgent(item)).length,
    [allItems],
  )

  const submit = useCallback(async () => {
    const ok = await organizer.organize(text.trim())
    if (ok) setText('')
  }, [organizer, text])

  const onUpdate = useCallback(
    (id: string, patch: UpdateItemInput) => updateItem.mutate({ id, patch }),
    [updateItem],
  )
  const onDelete = useCallback((id: string) => deleteItem.mutate(id), [deleteItem])

  return (
    <div className="min-h-dvh">
      <AppHeader urgentCount={urgentCount} />
      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
        <DumpInput
          value={text}
          onChange={setText}
          onSubmit={submit}
          onCancel={organizer.cancel}
          state={organizer.state}
          busy={organizer.busy}
          aiConfigured={health.data?.aiConfigured}
          onTryExample={allItems.length === 0 ? () => setText(EXAMPLE_DUMP) : undefined}
        />

        {items.isError ? (
          <p className="text-sm text-destructive">Could not load your items: {items.error.message}</p>
        ) : (
          <Board
            items={allItems}
            fresh={organizer.state.fresh}
            thinking={organizer.state.phase === 'thinking' || organizer.state.phase === 'starting'}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        )}
      </main>
    </div>
  )
}
