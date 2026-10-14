import { ArrowRight, Download, PenLine, Sparkles } from 'lucide-react'
import { EXAMPLES } from '@/lib/example'
import { TYPE_META } from '@/lib/items'
import { cn } from '@/lib/utils'

const STEPS = [
  { icon: PenLine, title: 'Dump', text: 'Type, paste, dictate or drop a file. Messy is fine.' },
  { icon: Sparkles, title: 'Sift', text: 'The AI sorts each thought as it reads, with dates and priorities.' },
  { icon: Download, title: 'Act', text: 'Check things off, drag, snooze, or export to Markdown and JSON.' },
]

/** The first-run screen, shown instead of an empty board. */
export function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <section aria-label="Welcome" className="rounded-xl border bg-card px-5 py-8 shadow-xs sm:px-10 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {Object.values(TYPE_META).map((meta) => (
            <span key={meta.label} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', meta.dot)} />
              {meta.plural}
            </span>
          ))}
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Empty your head. Sift sorts it.
        </h2>
        <p className="mt-2 max-w-xl text-sm text-pretty text-muted-foreground">
          Write everything that is on your mind in the box above. Sift turns it into tasks, ideas, reminders and
          questions, live.
        </p>

        <ol className="mt-7 grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  <span className="mr-1 font-mono text-xs text-muted-foreground">{index + 1}</span>
                  {title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="mt-8 text-xs font-medium text-muted-foreground">Or start with a sample</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <button
              key={example.key}
              type="button"
              onClick={() => onPick(example.text)}
              className="group/ex flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{example.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{example.blurb}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/ex:translate-x-0.5 group-hover/ex:text-primary" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
