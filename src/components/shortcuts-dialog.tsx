import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SHORTCUTS } from '@/lib/shortcuts'

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Click a card or press Tab to focus it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{group}</h3>
              <ul className="space-y-1">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                    <span>{s.label}</span>
                    <KbdGroup>
                      {s.keys.map((key) => (
                        <Kbd key={key}>{key === 'Ctrl' && isMac ? '⌘' : key}</Kbd>
                      ))}
                    </KbdGroup>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
