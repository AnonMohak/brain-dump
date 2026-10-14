import { Braces, CalendarPlus, Download, FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ExportFormat = 'md' | 'json' | 'ics'

export function ExportMenu({
  count,
  datedCount,
  onExport,
  onImport,
}: {
  count: number
  /** Open items with a due date in the view: these become calendar events. */
  datedCount: number
  onExport: (format: ExportFormat) => void
  onImport: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Download /> <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Exports the current view: {count} item{count === 1 ? '' : 's'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport('md')} disabled={count === 0}>
          <FileText /> Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('json')} disabled={count === 0}>
          <Braces /> JSON (.json)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport('ics')} disabled={datedCount === 0}>
          <CalendarPlus /> Calendar (.ics)
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{datedCount}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onImport}>
          <Upload /> Import JSON…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
