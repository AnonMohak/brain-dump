import type { Dump } from '@shared/schemas'
import { Eye, History, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useDeleteDump } from '@/hooks/use-data'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

type DumpsSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  dumps: Dump[]
  activeDumpId: string | null
  busy: boolean
  onShow: (dumpId: string) => void
  onRerun: (dumpId: string) => void
}

type Confirm = { kind: 'rerun' | 'delete'; dump: Dump } | null

export function DumpsSheet({ open, onOpenChange, dumps, activeDumpId, busy, onShow, onRerun }: DumpsSheetProps) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const deleteDump = useDeleteDump()

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <History /> <span className="hidden sm:inline">Dumps</span>
            {dumps.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums opacity-70">{dumps.length}</span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Your dumps</SheetTitle>
            <SheetDescription>Every brain dump you sorted, newest first.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3">
            {dumps.length === 0 && (
              <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                No dumps yet. Write one and press Organize.
              </p>
            )}
            <ul className="space-y-2">
              {dumps.map((dump) => {
                const working = dump.id === activeDumpId && busy
                const isOpen = expanded === dump.id
                return (
                  <li key={dump.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {dump.title ?? (working ? 'Sorting…' : 'Untitled dump')}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <time dateTime={dump.createdAt} title={new Date(dump.createdAt).toLocaleString()}>
                            {timeAgo(dump.createdAt)}
                          </time>
                          <span>·</span>
                          <span className="tabular-nums">
                            {dump.itemCount} item{dump.itemCount === 1 ? '' : 's'}
                          </span>
                        </p>
                      </div>
                      {working ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : dump.status === 'failed' ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : dump.status === 'cancelled' ? (
                        <Badge variant="secondary">Stopped</Badge>
                      ) : null}
                    </div>

                    {dump.summary && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{dump.summary}</p>}
                    {dump.error && <p className="mt-2 text-xs text-destructive">{dump.error}</p>}

                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : dump.id)}
                      aria-expanded={isOpen}
                      className={cn(
                        'mt-2 w-full rounded-md bg-muted/60 px-2 py-1.5 text-left font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground transition-colors hover:bg-muted',
                      )}
                    >
                      <span className={cn('block', !isOpen && 'line-clamp-2')}>{dump.rawText}</span>
                    </button>

                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={dump.itemCount === 0}
                        onClick={() => {
                          onShow(dump.id)
                          onOpenChange(false)
                        }}
                      >
                        <Eye /> Show items
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'rerun', dump })}
                      >
                        <RotateCcw /> Re-run
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        disabled={working}
                        onClick={() => setConfirm({ kind: 'delete', dump })}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === 'rerun' ? 'Run the AI again?' : 'Delete this dump?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'rerun'
                ? `This deletes the ${confirm.dump.itemCount} item${confirm.dump.itemCount === 1 ? '' : 's'} from this dump, including your edits, and sorts the text again.`
                : `This deletes the dump text and its ${confirm?.dump.itemCount ?? 0} item${confirm?.dump.itemCount === 1 ? '' : 's'}. You cannot undo this.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === 'rerun') {
                  onRerun(confirm.dump.id)
                  onOpenChange(false)
                } else {
                  deleteDump.mutate(confirm.dump.id)
                }
                setConfirm(null)
              }}
            >
              {confirm?.kind === 'rerun' ? 'Re-run' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
