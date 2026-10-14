import type { Dump, Item } from '@shared/schemas'
import type { Filters } from '@shared/view'
import {
  AlarmClock,
  Braces,
  EyeOff,
  FileText,
  FilterX,
  History,
  Keyboard,
  Monitor,
  Moon,
  PenLine,
  Sun,
} from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useTheme } from '@/hooks/use-theme'
import { TYPE_META } from '@/lib/items'
import { cn } from '@/lib/utils'
import type { ExportFormat } from './export-menu'

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: Item[]
  dumps: Dump[]
  filters: Filters
  setFilters: (update: Partial<Filters>) => void
  clearFilters: () => void
  onNewDump: () => void
  onExport: (format: ExportFormat) => void
  onOpenItem: (item: Item) => void
  onOpenDumps: () => void
  onOpenShortcuts: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  dumps,
  filters,
  setFilters,
  clearFilters,
  onNewDump,
  onExport,
  onOpenItem,
  onOpenDumps,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const { setTheme } = useTheme()
  const run = (action: () => void) => () => {
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search items and run actions">
      <Command>
      <CommandInput placeholder="Search items, dumps and actions…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(onNewDump)}>
            <PenLine /> New dump
          </CommandItem>
          <CommandItem onSelect={run(() => onExport('md'))}>
            <FileText /> Export view as Markdown
          </CommandItem>
          <CommandItem onSelect={run(() => onExport('json'))}>
            <Braces /> Export view as JSON
          </CommandItem>
          <CommandItem onSelect={run(onOpenDumps)}>
            <History /> Open dump history
          </CommandItem>
          <CommandItem onSelect={run(() => setFilters({ urgent: !filters.urgent }))}>
            <AlarmClock /> {filters.urgent ? 'Show all items' : 'Show urgent items only'}
          </CommandItem>
          <CommandItem onSelect={run(() => setFilters({ hideDone: !filters.hideDone }))}>
            <EyeOff /> {filters.hideDone ? 'Show done items' : 'Hide done items'}
          </CommandItem>
          <CommandItem onSelect={run(clearFilters)}>
            <FilterX /> Clear filters
          </CommandItem>
          <CommandItem onSelect={run(onOpenShortcuts)}>
            <Keyboard /> Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={run(() => setTheme('light'))}>
            <Sun /> Light theme
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('dark'))}>
            <Moon /> Dark theme
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('system'))}>
            <Monitor /> System theme
          </CommandItem>
        </CommandGroup>

        {dumps.some((dump) => dump.itemCount > 0) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Dumps">
              {dumps
                .filter((dump) => dump.itemCount > 0)
                .map((dump) => (
                  <CommandItem
                    key={dump.id}
                    value={`dump ${dump.id} ${dump.title ?? ''} ${dump.summary ?? ''}`}
                    onSelect={run(() => setFilters({ dump: dump.id }))}
                  >
                    <History />
                    <span className="truncate">{dump.title ?? 'Untitled dump'}</span>
                    <CommandShortcut>{dump.itemCount}</CommandShortcut>
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}

        {items.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Items">
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`item ${item.id} ${item.title} ${item.tags.join(' ')}`}
                  onSelect={run(() => onOpenItem(item))}
                >
                  <span className={cn('size-2 shrink-0 rounded-full', TYPE_META[item.type].dot)} />
                  <span className={cn('truncate', item.status === 'done' && 'text-muted-foreground line-through')}>
                    {item.title}
                  </span>
                  <CommandShortcut>{TYPE_META[item.type].label}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
