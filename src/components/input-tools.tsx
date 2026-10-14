import { Mic, Paperclip, Square } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readTextFile } from '@/lib/files'
import { cn } from '@/lib/utils'

export function VoiceButton({
  listening,
  onStart,
  onStop,
  disabled,
}: {
  listening: boolean
  onStart: () => void
  onStop: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictation' : 'Dictate'}
          onClick={listening ? onStop : onStart}
          className={cn('text-muted-foreground', listening && 'bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive')}
        >
          {listening ? <Square className="fill-current" /> : <Mic />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        {listening ? 'Stop dictation' : 'Dictate. Your browser sends the audio to Google or Microsoft for speech recognition.'}
      </TooltipContent>
    </Tooltip>
  )
}

export function FileButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label="Load a text file"
            className="text-muted-foreground"
            onClick={() => input.current?.click()}
          >
            <Paperclip />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Load a .txt or .md file (or drop it on the box)</TooltipContent>
      </Tooltip>
      <input
        ref={input}
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            onText(await readTextFile(file))
          } catch (error) {
            toast.error((error as Error).message)
          }
        }}
      />
    </>
  )
}
