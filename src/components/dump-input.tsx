import { MAX_DUMP_CHARS } from '@shared/schemas'
import { AlertTriangle, CornerDownLeft, Loader2, Sparkles, Square } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import type { OrganizeState } from '@/hooks/use-organize'
import { cn } from '@/lib/utils'

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

type DumpInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  state: OrganizeState
  busy: boolean
  aiConfigured: boolean | undefined
  onTryExample?: () => void
  /** Extra controls on the left of the footer (voice, file). */
  tools?: ReactNode
  textareaRef?: React.Ref<HTMLTextAreaElement>
}

export function DumpInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  state,
  busy,
  aiConfigured,
  onTryExample,
  tools,
  textareaRef,
}: DumpInputProps) {
  const length = value.length
  const tooLong = length > MAX_DUMP_CHARS
  const canSubmit = value.trim().length > 0 && !tooLong && !busy

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/15',
        busy && 'border-primary/40',
      )}
    >
      {busy && (
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden rounded-t-xl" aria-hidden="true">
          <div className="h-full w-1/3 animate-[sift-scan_1.6s_ease-in-out_infinite] bg-linear-to-r from-transparent via-primary to-transparent" />
        </div>
      )}
      <label htmlFor="dump" className="sr-only">
        Brain dump
      </label>
      <textarea
        id="dump"
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            if (canSubmit) onSubmit()
          }
        }}
        readOnly={busy}
        placeholder="Dump everything on your mind. Messy is fine. Sift sorts it into tasks, ideas, reminders and questions."
        className="block max-h-[45vh] min-h-32 w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground/70 read-only:text-muted-foreground"
      />

      {aiConfigured === false && (
        <p className="mx-3 mb-2 flex items-start gap-2 rounded-lg bg-due-soon/10 px-3 py-2 text-xs text-due-soon">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            The AI is not set up. Add <code className="font-mono">OPENROUTER_API_KEY</code> to{' '}
            <code className="font-mono">.env</code> and restart the server.
          </span>
        </p>
      )}

      <div className="flex min-h-12 flex-wrap items-center gap-2 border-t px-2.5 py-2">
        {tools}
        {!value && onTryExample && !busy && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onTryExample}>
            <Sparkles /> Try an example
          </Button>
        )}
        {length > 0 && (
          <span
            className={cn(
              'font-mono text-[11px] text-muted-foreground tabular-nums',
              length > MAX_DUMP_CHARS * 0.9 && 'text-due-soon',
              tooLong && 'text-destructive',
            )}
          >
            {length.toLocaleString()} / {MAX_DUMP_CHARS.toLocaleString()}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {busy ? (
            <>
              <StreamStatus state={state} />
              <Button variant="outline" size="sm" onClick={onCancel}>
                <Square className="fill-current" /> Stop
              </Button>
            </>
          ) : (
            <Button onClick={onSubmit} disabled={!canSubmit} className="pr-1.5">
              Organize
              <KbdGroup className="ml-1 hidden sm:inline-flex">
                <Kbd className="bg-primary-foreground/15 text-primary-foreground">{isMac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                  <CornerDownLeft />
                </Kbd>
              </KbdGroup>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function useElapsedSeconds(since: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  return since ? Math.max(0, Math.round((now - since) / 1000)) : 0
}

export function StreamStatus({ state }: { state: OrganizeState }) {
  const seconds = useElapsedSeconds(state.startedAt)
  const label =
    state.phase === 'writing'
      ? `Sorting · ${state.count} item${state.count === 1 ? '' : 's'}`
      : state.phase === 'thinking'
        ? 'Thinking'
        : 'Connecting'

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary"
    >
      <Loader2 className="size-3.5 animate-spin" />
      <span>{label}</span>
      <span className="font-mono text-[11px] opacity-70 tabular-nums">{seconds}s</span>
    </span>
  )
}
