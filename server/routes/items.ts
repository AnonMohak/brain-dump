import { Hono } from 'hono'
import { createItemInputSchema, updateItemInputSchema } from '../../shared/schemas'
import type { Db } from '../db/client'
import { createItem, deleteItem, listItems, topPosition, updateItem } from '../db/repo'
import { validate } from '../validate'

export function itemRoutes(db: Db) {
  return new Hono()
    .get('/', (c) => c.json(listItems(db)))
    .post('/', validate('json', createItemInputSchema), (c) => {
      const input = c.req.valid('json')
      const dueDate = input.dueDate ?? null
      const item = createItem(db, {
        dumpId: null,
        type: input.type,
        title: input.title,
        details: input.details ?? null,
        priority: input.priority,
        dueDate,
        dueTime: input.dueTime ?? null,
        dueSource: dueDate ? 'stated' : null,
        tags: input.tags,
        sourceQuote: null,
        position: topPosition(db, input.type) - 1,
        subtasks: input.subtasks,
      })
      return c.json(item, 201)
    })
    .patch('/:id', validate('json', updateItemInputSchema), (c) => {
      const item = updateItem(db, c.req.param('id'), c.req.valid('json'))
      return item ? c.json(item) : c.json({ error: 'Item not found' }, 404)
    })
    .delete('/:id', (c) =>
      deleteItem(db, c.req.param('id')) ? c.body(null, 204) : c.json({ error: 'Item not found' }, 404),
    )
}
