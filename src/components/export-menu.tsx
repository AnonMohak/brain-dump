import { Braces, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ExportFormat = 'md' | 'json'

export function ExportMenu({ count, onExport }: { count: number; onExport: (format: ExportFormat) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={count === 0}>
          <Download /> <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Exports the current view: {count} item{count === 1 ? '' : 's'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport('md')}>
          <FileText /> Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('json')}>
          <Braces /> JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
