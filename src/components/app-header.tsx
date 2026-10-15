import { AlarmClock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BASE } from '@/lib/base'
import { Logo } from './logo'
import { GoogleCalendarMenu } from './google-calendar-menu'
import { ThemeToggle } from './theme-toggle'

type AppHeaderProps = {
  urgentCount: number
  onUrgentClick?: () => void
  urgentActive?: boolean
  /** Buttons on the right, before the theme toggle. */
  actions?: ReactNode
}

export function AppHeader({ urgentCount, onUrgentClick, urgentActive, actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/65">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <a href={BASE} className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Sift</span>
        </a>

        {urgentCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onUrgentClick}
                aria-pressed={urgentActive}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-full border border-overdue/25 bg-overdue/10 px-2 text-xs font-medium text-overdue tabular-nums transition-colors hover:bg-overdue/15',
                  urgentActive && 'ring-2 ring-overdue/30',
                )}
              >
                <AlarmClock className="size-3.5" />
                {urgentCount} urgent
              </button>
            </TooltipTrigger>
            <TooltipContent>Overdue or due within 24 hours. Click to filter.</TooltipContent>
          </Tooltip>
        )}

        <div className="ml-auto flex items-center gap-1">
          {actions}
          <GoogleCalendarMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
