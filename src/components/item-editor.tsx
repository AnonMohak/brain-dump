import { dueMoment, formatDue, toLocalIsoDate } from '@shared/dates'
import {
  ITEM_TYPES,
  MAX_SUBTASKS,
  normalizeTag,
  PRIORITIES,
  type Item,
  type ItemType,
  type Priority,
} from '@shared/schemas'
import { CalendarDays, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { useCreateItem, useUpdateItem } from '@/hooks/use-data'
import { PRIORITY_META, TYPE_META } from '@/lib/items'
import { cn } from '@/lib/utils'
import { PriorityIcon } from './item-card'

/** "edit" an existing item, or "create" a new one in a column. */
export type EditorTarget = { mode: 'edit'; item: Item } | { mode: 'create'; type: ItemType } | null

type Draft = {
  type: ItemType
  title: string
  details: string
  priority: Priority
  dueDate: string | null
  dueTime: string
  tags: string
  subtasks: { id?: string; text: string; done: boolean }[]
}

function draftFrom(target: Exclude<EditorTarget, null>): Draft {
  if (target.mode === 'create') {
    return { type: target.type, title: '', details: '', priority: 'medium', dueDate: null, dueTime: '', tags: '', subtasks: [] }
  }
  const { item } = target
  return {
    type: item.type,
    title: item.title,
    details: item.details ?? '',
    priority: item.priority,
    dueDate: item.dueDate,
    dueTime: item.dueTime ?? '',
    tags: item.tags.join(', '),
    subtasks: item.subtasks.map((s) => ({ id: s.id, text: s.text, done: s.done })),
  }
}

function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).map(normalizeTag).filter(Boolean))]
}

type EditorProps = { target: EditorTarget; onClose: () => void; onDelete: (id: string) => void }

export function ItemEditor({ target, onClose, onDelete }: EditorProps) {
  if (!target) return null
  const key = target.mode === 'edit' ? target.item.id : `new-${target.type}`
  return <EditorDialog key={key} target={target} onClose={onClose} onDelete={onDelete} />
}

function EditorDialog({ target, onClose, onDelete }: Omit<EditorProps, 'target'> & { target: Exclude<EditorTarget, null> }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(target))
  const [newSubtask, setNewSubtask] = useState('')
  const [dateOpen, setDateOpen] = useState(false)
  const update = useUpdateItem()
  const create = useCreateItem()

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const item = target.mode === 'edit' ? target.item : null
  const canSave = draft.title.trim().length > 0

  function save() {
    if (!canSave) return
    const subtasks = [...draft.subtasks]
    if (newSubtask.trim()) subtasks.push({ text: newSubtask.trim(), done: false })
    const fields = {
      type: draft.type,
      title: draft.title.trim(),
      details: draft.details.trim() || null,
      priority: draft.priority,
      dueDate: draft.dueDate,
      dueTime: draft.dueDate && draft.dueTime ? draft.dueTime : null,
      tags: parseTags(draft.tags),
      subtasks: subtasks.filter((s) => s.text.trim()).slice(0, MAX_SUBTASKS),
    }
    if (item) {
      // Keep an AI suggestion marked as such when the user did not touch the date.
      const dateUnchanged = item.dueDate === fields.dueDate
      update.mutate({
        id: item.id,
        patch: { ...fields, ...(dateUnchanged ? { dueSource: item.dueSource } : {}) },
      })
    } else {
      create.mutate(fields)
    }
    onClose()
  }

  const selectedDate = draft.dueDate ? dueMoment(draft.dueDate, null) : undefined

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : `New ${TYPE_META[draft.type].label.toLowerCase()}`}</DialogTitle>
          <DialogDescription className="sr-only">Change the fields, then save.</DialogDescription>
        </DialogHeader>

        <form
          id="item-editor"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
            {ITEM_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={draft.type === type}
                onClick={() => set({ type })}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                  draft.type === type
                    ? 'border-foreground/20 bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <span className={cn('size-2 rounded-full', TYPE_META[type].dot)} />
                {TYPE_META[type].label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-title">Title</Label>
            <Input
              id="item-title"
              autoFocus
              value={draft.title}
              maxLength={200}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="What is it?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-details">Details</Label>
            <Textarea
              id="item-details"
              value={draft.details}
              maxLength={2000}
              onChange={(e) => set({ details: e.target.value })}
              placeholder="Optional notes"
              className="max-h-40 min-h-16"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Priority">
                {PRIORITIES.map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    role="radio"
                    aria-checked={draft.priority === priority}
                    onClick={() => set({ priority })}
                    className={cn(
                      'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors',
                      draft.priority === priority
                        ? 'bg-accent text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <PriorityIcon priority={priority} />
                    {PRIORITY_META[priority].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Due</Label>
              <div className="flex gap-1.5">
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start font-normal">
                      <CalendarDays className="text-muted-foreground" />
                      {draft.dueDate ? (
                        <span>
                          {item?.dueSource === 'suggested' && item.dueDate === draft.dueDate ? '~' : ''}
                          {formatDue(draft.dueDate, null)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      defaultMonth={selectedDate}
                      onSelect={(date) => {
                        set({ dueDate: date ? toLocalIsoDate(date) : null })
                        setDateOpen(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {draft.dueDate && (
                  <>
                    <Input
                      type="time"
                      aria-label="Due time"
                      value={draft.dueTime}
                      onChange={(e) => set({ dueTime: e.target.value })}
                      className="w-24"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove the date"
                      onClick={() => set({ dueDate: null, dueTime: '' })}
                    >
                      <X />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-tags">Tags</Label>
            <Input
              id="item-tags"
              value={draft.tags}
              onChange={(e) => set({ tags: e.target.value })}
              placeholder="work, health"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-subtask">Subtasks</Label>
            {draft.subtasks.length > 0 && (
              <ul className="space-y-1">
                {draft.subtasks.map((subtask, index) => (
                  <li key={subtask.id ?? index} className="group/sub flex items-center gap-2">
                    <Checkbox
                      checked={subtask.done}
                      aria-label="Done"
                      onCheckedChange={(checked) =>
                        set({
                          subtasks: draft.subtasks.map((s, i) => (i === index ? { ...s, done: Boolean(checked) } : s)),
                        })
                      }
                    />
                    <input
                      value={subtask.text}
                      aria-label={`Subtask ${index + 1}`}
                      onChange={(e) =>
                        set({
                          subtasks: draft.subtasks.map((s, i) => (i === index ? { ...s, text: e.target.value } : s)),
                        })
                      }
                      className={cn(
                        'h-7 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none hover:bg-muted/60 focus:bg-muted/60',
                        subtask.done && 'text-muted-foreground line-through',
                      )}
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove the subtask"
                      className="opacity-60 group-hover/sub:opacity-100"
                      onClick={() => set({ subtasks: draft.subtasks.filter((_, i) => i !== index) })}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {draft.subtasks.length < MAX_SUBTASKS && (
              <div className="flex items-center gap-2">
                <Plus className="size-4 text-muted-foreground" />
                <input
                  id="new-subtask"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (!newSubtask.trim()) return
                      set({ subtasks: [...draft.subtasks, { text: newSubtask.trim(), done: false }] })
                      setNewSubtask('')
                    }
                  }}
                  placeholder="Add a step, then press Enter"
                  className="h-7 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground/70 hover:bg-muted/60 focus:bg-muted/60"
                />
              </div>
            )}
          </div>

          {item?.sourceQuote && (
            <blockquote className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground italic">
              From your dump: “{item.sourceQuote}”
            </blockquote>
          )}
        </form>

        <DialogFooter className="sm:justify-between">
          {item ? (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(item.id)
                onClose()
              }}
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="item-editor" disabled={!canSave}>
              {item ? 'Save' : 'Add'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
