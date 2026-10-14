import { AlertTriangle, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAiText, type AiTextState } from '@/hooks/use-ai-text'
import { MiniMarkdown } from './mini-markdown'

/** "Plan my day": starts the AI plan when the dialog opens. */
export function PlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, run, reset } = useAiText()
  const started = useRef(false)

  useEffect(() => {
    if (open && !started.current) {
      started.current = true
      void run('plan')
    }
    if (!open) {
      started.current = false
      reset()
    }
  }, [open, run, reset])

  return (
    <AnswerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Plan my day"
      description="A short plan from your open items."
      state={state}
      onRetry={() => void run('plan')}
    />
  )
}

/** The dialog frame for a streamed AI answer. */
export function AnswerShell({
  open,
  onOpenChange,
  title,
  description,
  state,
  onRetry,
  retryDisabled,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  state: AiTextState
  onRetry: () => void
  retryDisabled?: boolean
  children?: ReactNode
}) {
  const busy = state.phase === 'thinking' || state.phase === 'writing'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="max-h-[55vh] min-h-24 overflow-y-auto" aria-live="polite" aria-busy={busy}>
          {state.phase === 'thinking' && !state.text && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Thinking{state.model ? ` with ${state.model}` : ''}…
            </p>
          )}
          {state.text && <MiniMarkdown text={state.text} />}
          {state.phase === 'error' && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> {state.error}
            </p>
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="font-mono text-[11px] text-muted-foreground">
            {state.phase === 'done' ? state.model : ''}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={busy || retryDisabled}>
            <RotateCcw /> Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
