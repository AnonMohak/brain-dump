import { Monitor, Moon, Rows3, Rows4, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ACCENT_SWATCH, ACCENTS, useAccent, type Accent } from '@/hooks/use-accent'
import { useDensity, type Density } from '@/hooks/use-density'
import { useTheme, type Theme } from '@/hooks/use-theme'

/** The appearance menu: theme, accent color and card density. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [density, setDensity] = useDensity()
  const [accent, setAccent] = useAccent()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Appearance">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Accent</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={accent} onValueChange={(value) => setAccent(value as Accent)}>
          {ACCENTS.map((name) => (
            <DropdownMenuRadioItem key={name} value={name} className="capitalize">
              <span className="size-3 rounded-full" style={{ background: ACCENT_SWATCH[name] }} />
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Cards</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={(value) => setDensity(value as Density)}>
          <DropdownMenuRadioItem value="comfortable">
            <Rows3 /> Comfortable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">
            <Rows4 /> Compact
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
