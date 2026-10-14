import { PRIORITIES, type Dump, type Priority } from '@shared/schemas'
import { hasActiveFilters, type Filters } from '@shared/view'
import { AlarmClock, Archive, EyeOff, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PRIORITY_META } from '@/lib/items'
import { cn } from '@/lib/utils'
import { PriorityIcon } from './item-card'

const ALL = '__all__'

type FilterBarProps = {
  filters: Filters
  setFilters: (update: Partial<Filters>) => void
  clearFilters: () => void
  dumps: Dump[]
  tags: string[]
  shown: number
  total: number
  archivedCount: number
  searchRef?: React.Ref<HTMLInputElement>
}

function Toggle({
  pressed,
  onClick,
  children,
  label,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors',
        pressed ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function FilterBar({
  filters,
  setFilters,
  clearFilters,
  dumps,
  tags,
  shown,
  total,
  archivedCount,
  searchRef,
}: FilterBarProps) {
  const active = hasActiveFilters(filters)
  const dumpLabel = (dump: Dump) =>
    dump.title ?? `Dump from ${new Date(dump.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder="Search items"
          aria-label="Search items"
          className="h-7 w-full rounded-lg border bg-transparent pr-2 pl-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
        />
      </div>

      <Select value={filters.dump ?? ALL} onValueChange={(v) => setFilters({ dump: v === ALL ? null : v })}>
        <SelectTrigger size="sm" className="h-7 max-w-52 text-xs" aria-label="Filter by dump">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All dumps</SelectItem>
          {dumps
            .filter((dump) => dump.itemCount > 0 || dump.id === filters.dump)
            .map((dump) => (
              <SelectItem key={dump.id} value={dump.id}>
                {dumpLabel(dump)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Select value={filters.tag ?? ALL} onValueChange={(v) => setFilters({ tag: v === ALL ? null : v })}>
        <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Filter by tag">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All tags</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag} value={tag}>
              #{tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority ?? ALL}
        onValueChange={(v) => setFilters({ priority: v === ALL ? null : (v as Priority) })}
      >
        <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Filter by priority">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any priority</SelectItem>
          {PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              <PriorityIcon priority={priority} /> {PRIORITY_META[priority].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Toggle pressed={filters.urgent} onClick={() => setFilters({ urgent: !filters.urgent })} label="Show only urgent items">
        <AlarmClock className="size-3.5" /> Urgent
      </Toggle>
      <Toggle pressed={filters.hideDone} onClick={() => setFilters({ hideDone: !filters.hideDone })} label="Hide done items">
        <EyeOff className="size-3.5" /> Hide done
      </Toggle>
      {archivedCount > 0 && (
        <Toggle
          pressed={filters.showArchived}
          onClick={() => setFilters({ showArchived: !filters.showArchived })}
          label="Show archived items (done more than 7 days ago)"
        >
          <Archive className="size-3.5" /> Archived <span className="tabular-nums opacity-70">{archivedCount}</span>
        </Toggle>
      )}

      {active && (
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearFilters}>
          <X /> Clear
        </Button>
      )}

      <span className="ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {active || shown !== total ? `${shown} of ${total} items` : `${total} item${total === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}
