import { ITEM_TYPES, type Item, type ItemType, type UpdateItemInput } from '@shared/schemas'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMediaQuery } from '@/hooks/use-media-query'
import { groupByType, TYPE_META } from '@/lib/items'
import { cn } from '@/lib/utils'
import { ItemCard, ItemCardSkeleton } from './item-card'

export type BoardActions = {
  onUpdate: (id: string, patch: UpdateItemInput) => void
  onDelete: (id: string) => void
  onEdit?: (item: Item) => void
  onAdd?: (type: ItemType) => void
}

type BoardProps = BoardActions & {
  items: Item[]
  fresh: ReadonlySet<string>
  thinking: boolean
}

export function Board({ items, fresh, thinking, ...actions }: BoardProps) {
  const groups = useMemo(() => groupByType(items), [items])
  const isMobile = useMediaQuery('(max-width: 767px)')

  if (isMobile) {
    return (
      <Tabs defaultValue="task" className="gap-3">
        <TabsList className="w-full">
          {ITEM_TYPES.map((type) => (
            <TabsTrigger key={type} value={type} className="gap-1.5 px-1 text-xs">
              <span className={cn('size-1.5 rounded-full', TYPE_META[type].dot)} />
              {TYPE_META[type].plural}
              <span className="text-muted-foreground tabular-nums">{openCount(groups[type])}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {ITEM_TYPES.map((type) => (
          <TabsContent key={type} value={type}>
            <ColumnBody type={type} items={groups[type]} fresh={fresh} thinking={thinking} {...actions} />
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  return (
    <div className="grid grid-cols-2 items-start gap-3 xl:grid-cols-4">
      {ITEM_TYPES.map((type) => (
        <Column key={type} type={type} items={groups[type]} fresh={fresh} thinking={thinking} {...actions} />
      ))}
    </div>
  )
}

function openCount(items: Item[]) {
  return items.filter((item) => item.status === 'open').length
}

type ColumnProps = BoardActions & {
  type: ItemType
  items: Item[]
  fresh: ReadonlySet<string>
  thinking: boolean
}

function Column({ type, items, onAdd, ...rest }: ColumnProps) {
  const meta = TYPE_META[type]
  return (
    <section
      aria-label={meta.plural}
      className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-surface p-1.5"
    >
      <header className="flex h-9 items-center gap-2 pr-1 pl-2.5">
        <span className={cn('size-2 rounded-full', meta.dot)} />
        <h2 className="text-[13px] font-semibold tracking-tight">{meta.plural}</h2>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{openCount(items)}</span>
        {onAdd && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-muted-foreground"
            aria-label={`Add a ${meta.label.toLowerCase()}`}
            onClick={() => onAdd(type)}
          >
            <Plus />
          </Button>
        )}
      </header>
      <ColumnBody type={type} items={items} {...rest} />
    </section>
  )
}

function ColumnBody({
  type,
  items,
  fresh,
  thinking,
  onUpdate,
  onDelete,
  onEdit,
}: Omit<ColumnProps, 'onAdd'>) {
  return (
    <div className="flex min-h-28 flex-col gap-1.5">
      {thinking && <ItemCardSkeleton />}
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          fresh={fresh.has(item.id)}
          onUpdate={(patch) => onUpdate(item.id, patch)}
          onDelete={() => onDelete(item.id)}
          onEdit={onEdit ? () => onEdit(item) : undefined}
        />
      ))}
      {items.length === 0 && !thinking && (
        <p className="flex flex-1 items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
          {TYPE_META[type].empty}
        </p>
      )}
    </div>
  )
}
