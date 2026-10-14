import type { Item, UpdateItemInput } from '@shared/schemas'
import { todayGroups } from '@shared/today'
import { ChevronDown, Sun } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { useLocalSetting } from '@/hooks/use-local-setting'
import { TYPE_META } from '@/lib/items'
import { cn } from '@/lib/utils'
import { DueBadge, PriorityIcon } from './item-card'

type TodayPanelProps = {
  items: Item[]
  onUpdate: (id: string, patch: UpdateItemInput) => void
  onEdit: (item: Item) => void
  /** Extra buttons in the header (for example "Plan my day"). */
  actions?: ReactNode
}

const SECTIONS = [
  { key: 'overdue', label: 'Overdue', tone: 'text-overdue' },
  { key: 'today', label: 'Today', tone: 'text-foreground' },
  { key: 'tomorrow', label: 'Tomorrow', tone: 'text-muted-foreground' },
] as const

/** A calm, focused list above the board: what needs attention now. */
export function TodayPanel({ items, onUpdate, onEdit, actions }: TodayPanelProps) {
  const groups = useMemo(() => todayGroups(items), [items])
  const [open, setOpen] = useLocalSetting<'open' | 'closed'>('sift:today', 'open', ['open', 'closed'])
  const total = groups.overdue.length + groups.today.length + groups.tomorrow.length
  if (total === 0) return null
  const expanded = open === 'open'

  return (
    <section aria-label="Today" className="rounded-xl border bg-card shadow-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(expanded ? 'closed' : 'open')}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Sun className="size-4 text-due-soon" />
          <span className="text-[13px] font-semibold tracking-tight">Today</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {groups.overdue.length > 0 && <span className="text-overdue">{groups.overdue.length} overdue · </span>}
            {groups.today.length} today · {groups.tomorrow.length} tomorrow
          </span>
          <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', !expanded && '-rotate-90')} />
        </button>
        {actions}
      </div>

      {expanded && (
        <div
          className={cn(
            'grid gap-x-6 gap-y-3 border-t px-3 py-3',
            { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' }[SECTIONS.filter(({ key }) => groups[key].length).length],
          )}
        >
          {SECTIONS.filter(({ key }) => groups[key].length > 0).map(({ key, label, tone }) => (
            <div key={key} className="min-w-0">
              <h3 className={cn('mb-1.5 text-[11px] font-medium tracking-wide uppercase', tone)}>
                {label} <span className="tabular-nums opacity-60">{groups[key].length}</span>
              </h3>
              <ul className="space-y-0.5">
                {groups[key].map((item) => (
                  <li key={item.id} className="group/row flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => onUpdate(item.id, { status: 'done' })}
                      aria-label={`Mark "${item.title}" as done`}
                      className="rounded-full"
                    />
                    <span className={cn('size-1.5 shrink-0 rounded-full', TYPE_META[item.type].dot)} />
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="min-w-0 flex-1 truncate text-left text-sm outline-none focus-visible:underline"
                    >
                      {item.title}
                    </button>
                    {item.priority === 'high' && (
                      <PriorityIcon priority="high" className="shrink-0 text-orange-600 dark:text-orange-400" />
                    )}
                    <DueBadge item={item} className="shrink-0" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
