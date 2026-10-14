import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ITEM_TYPES, type Item, type ItemType, type UpdateItemInput } from '@shared/schemas'
import { positionBetween } from '@shared/view'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
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

const columnId = (type: ItemType) => `column:${type}`

export function Board({ items, fresh, thinking, ...actions }: BoardProps) {
  const groups = useMemo(() => groupByType(items), [items])
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeItem = activeId ? items.find((item) => item.id === activeId) : undefined

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function findType(id: string): ItemType | null {
    if (id.startsWith('column:')) return id.slice('column:'.length) as ItemType
    return items.find((item) => item.id === id)?.type ?? null
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const item = items.find((i) => i.id === active.id)
    const targetType = findType(String(over.id))
    if (!item || !targetType) return

    const target = groups[targetType]
    let ordered: Item[]
    if (targetType === item.type) {
      const from = target.findIndex((i) => i.id === item.id)
      const to = over.id === columnId(targetType) ? target.length - 1 : target.findIndex((i) => i.id === over.id)
      if (from === to || to < 0) return
      ordered = arrayMove(target, from, to)
    } else {
      const rest = target.filter((i) => i.id !== item.id)
      const overIndex = rest.findIndex((i) => i.id === over.id)
      const at = overIndex < 0 ? rest.length : overIndex
      ordered = [...rest.slice(0, at), item, ...rest.slice(at)]
    }

    const index = ordered.findIndex((i) => i.id === item.id)
    const position = positionBetween(ordered[index - 1]?.position, ordered[index + 1]?.position)
    actions.onUpdate(item.id, targetType === item.type ? { position } : { type: targetType, position })
  }

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
          <TabsContent key={type} value={type} className="space-y-2">
            {actions.onAdd && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => actions.onAdd!(type)}>
                <Plus /> Add a {TYPE_META[type].label.toLowerCase()}
              </Button>
            )}
            <ColumnBody type={type} items={groups[type]} fresh={fresh} thinking={thinking} sortable={false} {...actions} />
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }: DragStartEvent) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'To pick up a card, press Space or Enter. Use the arrow keys to move it. Press Space or Enter again to drop it, or Escape to cancel.',
        },
      }}
    >
      <div className="grid grid-cols-2 items-start gap-3 xl:grid-cols-4">
        {ITEM_TYPES.map((type) => (
          <Column key={type} type={type} items={groups[type]} fresh={fresh} thinking={thinking} {...actions} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeItem ? (
          <ItemCard
            item={activeItem}
            onUpdate={() => {}}
            onDelete={() => {}}
            className="rotate-1 cursor-grabbing shadow-lg ring-1 ring-primary/30"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
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
  const { setNodeRef, isOver } = useDroppable({ id: columnId(type) })
  return (
    <section
      ref={setNodeRef}
      aria-label={meta.plural}
      className={cn(
        'flex min-w-0 flex-col rounded-xl border border-border/70 bg-surface p-1.5 transition-colors',
        isOver && 'border-primary/40 bg-primary/5',
      )}
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
      <ColumnBody type={type} items={items} sortable {...rest} />
    </section>
  )
}

function ColumnBody({
  type,
  items,
  fresh,
  thinking,
  sortable,
  onUpdate,
  onDelete,
  onEdit,
}: Omit<ColumnProps, 'onAdd'> & { sortable: boolean }) {
  const cards = items.map((item) => {
    const props = {
      item,
      fresh: fresh.has(item.id),
      onUpdate: (patch: UpdateItemInput) => onUpdate(item.id, patch),
      onDelete: () => onDelete(item.id),
      onEdit: onEdit ? () => onEdit(item) : undefined,
    }
    return sortable ? <SortableCard key={item.id} {...props} /> : <ItemCard key={item.id} {...props} />
  })

  return (
    <div className="flex min-h-28 flex-col gap-1.5">
      {thinking && <ItemCardSkeleton />}
      {sortable ? (
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {cards}
        </SortableContext>
      ) : (
        cards
      )}
      {items.length === 0 && !thinking && (
        <p className="flex flex-1 items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
          {TYPE_META[type].empty}
        </p>
      )}
    </div>
  )
}

function SortableCard(props: React.ComponentProps<typeof ItemCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
  })
  return (
    <ItemCard
      ref={setNodeRef}
      {...props}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable card"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-30')}
    />
  )
}
