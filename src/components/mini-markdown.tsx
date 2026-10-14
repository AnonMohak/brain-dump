import { Fragment, type ReactNode } from 'react'

/** **bold** inside a line, rendered as React nodes (no HTML parsing). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={index} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}

type Block = { kind: 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] }

function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    const kind = bullet ? 'ul' : numbered ? 'ol' : null
    const last = blocks.at(-1)
    if (kind) {
      const text = (bullet ?? numbered)![1]!
      if (last && last.kind === kind) last.items.push(text)
      else blocks.push({ kind, items: [text] })
    } else {
      blocks.push({ kind: 'p', text: line.replace(/^#+\s*/, '') })
    }
  }
  return blocks
}

/** A tiny, safe Markdown renderer for AI answers: paragraphs, lists and bold. */
export function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
      {toBlocks(text).map((block, index) => {
        if (block.kind === 'p') return <p key={index}>{inline(block.text)}</p>
        const List = block.kind
        return (
          <List key={index} className={List === 'ol' ? 'list-decimal space-y-1.5 pl-5' : 'list-disc space-y-1 pl-5'}>
            {block.items.map((item, i) => (
              <li key={i} className="pl-1 marker:text-muted-foreground/70">
                {inline(item)}
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
