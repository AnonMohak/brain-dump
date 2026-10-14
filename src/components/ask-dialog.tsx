import { CornerDownLeft } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAiText } from '@/hooks/use-ai-text'
import { AnswerShell } from './ai-answer-dialog'

const SUGGESTIONS = ['What is due this week?', 'What is urgent at work?', 'Which questions are still open?', 'What did I finish recently?']

/** "Ask the board": a question about your items, answered by the AI. */
export function AskDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Mounted only while open, so every opening starts fresh (and closing stops the stream).
  return props.open ? <AskContent {...props} /> : null
}

function AskContent({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, run } = useAiText()
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')

  const busy = state.phase === 'thinking' || state.phase === 'writing'
  const ask = (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setQuestion(q)
    setAsked(q)
    void run('ask', q)
  }

  return (
    <AnswerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Ask your board"
      description="Ask about your items. The AI answers from them only."
      state={state}
      onRetry={() => ask(asked)}
      retryDisabled={!asked}
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(question)
        }}
      >
        <Input
          autoFocus
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What is due this week?"
          aria-label="Your question"
        />
        <Button type="submit" disabled={!question.trim() || busy} aria-label="Ask">
          <CornerDownLeft />
        </Button>
      </form>
      {state.phase === 'idle' && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </AnswerShell>
  )
}
