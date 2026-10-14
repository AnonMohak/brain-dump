import { dueState, formatDue } from '@shared/dates'
import { ITEM_TYPES, PRIORITIES, type Item, type Priority, type UpdateItemInput } from '@shared/schemas'
import {
  ArrowRightLeft,
  CalendarDays,
  Flag,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Quote,
  Trash2,
} from 'lucide-react'
import { memo, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PRIORITY_META, TYPE_META } from '@/lib/items'
import { cn } from '@/lib/utils'

/** Keeps clicks and key presses on inner controls from starting a card drag. */
const stopDrag = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
}

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const bars = PRIORITY_META[priority].bars
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cn('size-3', className)}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 3.75}
          y={8 - i * 2.75}
          width="2.5"
          height={3 + i * 2.75}
          rx="0.75"
          fill="currentColor"
          opacity={i < bars ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 text-[11px] font-medium',
        priority === 'high' ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground',
      )}
    >
      <PriorityIcon priority={priority} />
      {PRIORITY_META[priority].label}
    </span>
  )
}

export function DueBadge({ item, className }: { item: Item; className?: string }) {
  if (!item.dueDate) return null
  const state = dueState(item)
  const suggested = item.dueSource === 'suggested'
  const label = formatDue(item.dueDate, item.dueTime)
  const badge = (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium tabular-nums',
        state === 'overdue' && 'bg-overdue/12 text-overdue',
        state === 'soon' && 'bg-due-soon/14 text-due-soon',
        (state === 'later' || state === null) && 'bg-muted text-muted-foreground',
        suggested && 'outline outline-1 -outline-offset-1 outline-dashed outline-current/35 bg-transparent',
        className,
      )}
    >
      <CalendarDays className="size-3" />
      {suggested && <span aria-hidden="true">~</span>}
      {label}
      {state === 'overdue' && <span className="sr-only">(overdue)</span>}
    </span>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        {state === 'overdue' ? 'Overdue. ' : state === 'soon' ? 'Due within 24 hours. ' : ''}
        {suggested ? 'Suggested by the AI.' : 'Due date.'} {item.dueDate}
        {item.dueTime ? ` ${item.dueTime}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

type ItemCardProps = {
  item: Item
  fresh?: boolean
  onUpdate: (patch: UpdateItemInput) => void
  onDelete: () => void
  onEdit?: () => void
} & Omit<ComponentProps<'article'>, 'onDrag'>

export const ItemCard = memo(function ItemCard({
  item,
  fresh,
  onUpdate,
  onDelete,
  onEdit,
  className,
  ...props
}: ItemCardProps) {
  const [showQuote, setShowQuote] = useState(false)
  const done = item.status === 'done'
  const doneSubtasks = item.subtasks.filter((s) => s.done).length

  return (
    <article
      {...props}
      className={cn(
        'group/card relative rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-[border-color,box-shadow,opacity] hover:border-foreground/15 hover:shadow-sm',
        done && 'opacity-55',
        fresh && 'animate-in fade-in-0 slide-in-from-top-2 duration-300 ease-out',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => onUpdate({ status: checked ? 'done' : 'open' })}
          {...stopDrag}
          aria-label={done ? 'Mark as open' : 'Mark as done'}
          className="mt-0.5 rounded-full"
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            {...stopDrag}
            className={cn(
              'block w-full text-left text-sm leading-snug font-medium text-pretty outline-none focus-visible:underline',
              onEdit ? 'cursor-pointer' : 'cursor-default',
              done && 'line-through decoration-muted-foreground/60',
            )}
          >
            {item.title}
          </button>
          {item.details && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.details}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <PriorityLabel priority={item.priority} />
            <DueBadge item={item} />
            {item.subtasks.length > 0 && (
              <span className="inline-flex h-5 items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                <ListChecks className="size-3" />
                {doneSubtasks}/{item.subtasks.length}
              </span>
            )}
            {item.tags.map((tag) => (
              <span key={tag} className="font-mono text-[11px] text-muted-foreground">
                #{tag}
              </span>
            ))}
            {item.sourceQuote && (
              <button
                type="button"
                onClick={() => setShowQuote((v) => !v)}
                {...stopDrag}
                aria-expanded={showQuote}
                aria-label={showQuote ? 'Hide the source quote' : 'Show the source quote'}
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  showQuote && 'bg-muted text-foreground',
                )}
              >
                <Quote className="size-3" />
              </button>
            )}
          </div>

          {showQuote && item.sourceQuote && (
            <blockquote className="mt-2 border-l-2 border-primary/40 pl-2 text-xs leading-relaxed text-muted-foreground italic animate-in fade-in-0">
              “{item.sourceQuote}”
            </blockquote>
          )}
        </div>

        <ItemMenu item={item} onUpdate={onUpdate} onDelete={onDelete} onEdit={onEdit} />
      </div>
    </article>
  )
})

function ItemMenu({
  item,
  onUpdate,
  onDelete,
  onEdit,
}: Pick<ItemCardProps, 'item' | 'onUpdate' | 'onDelete' | 'onEdit'>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Item actions"
          {...stopDrag}
          className="-mt-0.5 -mr-1 text-muted-foreground opacity-100 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 sm:opacity-0"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRightLeft /> Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={item.type}
              onValueChange={(value) => onUpdate({ type: value as Item['type'] })}
            >
              {ITEM_TYPES.map((type) => (
                <DropdownMenuRadioItem key={type} value={type}>
                  <span className={cn('size-2 rounded-full', TYPE_META[type].dot)} />
                  {TYPE_META[type].plural}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Flag /> Priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={item.priority}
              onValueChange={(value) => onUpdate({ priority: value as Priority })}
            >
              {PRIORITIES.map((priority) => (
                <DropdownMenuRadioItem key={priority} value={priority}>
                  <PriorityIcon priority={priority} />
                  {PRIORITY_META[priority].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ItemCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card/60 p-3" aria-hidden="true">
      <div className="flex items-start gap-2.5">
        <Skeleton className="mt-0.5 size-4 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
    </div>
  )
}
