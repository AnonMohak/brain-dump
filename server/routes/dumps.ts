import { Hono } from 'hono'
import type { Db } from '../db/client'
import { deleteDump, getDump, listDumps } from '../db/repo'

export function dumpRoutes(db: Db) {
  return new Hono()
    .get('/', (c) => c.json(listDumps(db)))
    .get('/:id', (c) => {
      const dump = getDump(db, c.req.param('id'))
      return dump ? c.json(dump) : c.json({ error: 'Dump not found' }, 404)
    })
    .delete('/:id', (c) =>
      deleteDump(db, c.req.param('id')) ? c.body(null, 204) : c.json({ error: 'Dump not found' }, 404),
    )
}
