import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { organizeInputSchema, rerunInputSchema, type Dump } from '../../shared/schemas'
import { organizeDump, type OrganizeArgs, type OrganizeDeps } from '../ai/organize'
import {
  createDump,
  deleteDump,
  deleteDumpItems,
  getDump,
  listDumps,
  listItems,
  updateDump,
} from '../db/repo'
import { validate } from '../validate'

const PING_MS = 15_000

/** Dumps that the AI processes right now, so that a re-run cannot start twice. */
const activeDumps = new Set<string>()

function streamOrganize(
  c: Context,
  deps: OrganizeDeps,
  dump: Dump,
  args: Omit<OrganizeArgs, 'signal' | 'dumpId'>,
) {
  return streamSSE(
    c,
    async (stream) => {
      const controller = new AbortController()
      stream.onAbort(() => controller.abort())
      activeDumps.add(dump.id)
      // Keeps the connection open while the model thinks.
      const ping = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {})
      }, PING_MS)

      try {
        await stream.writeSSE({ event: 'dump', data: JSON.stringify({ type: 'dump', dump }) })
        for await (const event of organizeDump(deps, {
          ...args,
          dumpId: dump.id,
          signal: controller.signal,
        })) {
          if (stream.aborted) break
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
        }
      } finally {
        clearInterval(ping)
        activeDumps.delete(dump.id)
      }
    },
    async (error, stream) => {
      console.error(error)
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', message: 'Server error', dump: null }),
      })
    },
  )
}

export function dumpRoutes(deps: OrganizeDeps) {
  const { db } = deps
  return new Hono()
    .get('/', (c) => c.json(listDumps(db)))
    .get('/:id', (c) => {
      const dump = getDump(db, c.req.param('id'))
      return dump ? c.json(dump) : c.json({ error: 'Dump not found' }, 404)
    })
    .post('/', validate('json', organizeInputSchema), (c) => {
      const input = c.req.valid('json')
      const dump = createDump(db, input.text)
      return streamOrganize(c, deps, dump, input)
    })
    .post('/:id/rerun', validate('json', rerunInputSchema), (c) => {
      const id = c.req.param('id')
      const dump = getDump(db, id)
      if (!dump) return c.json({ error: 'Dump not found' }, 404)
      if (activeDumps.has(id)) return c.json({ error: 'The AI is still working on this dump' }, 409)

      deps.calendar?.eventsOrphaned(listItems(db).filter((i) => i.dumpId === id).map((i) => i.googleEventId))
      deleteDumpItems(db, id)
      updateDump(db, id, {
        status: 'processing',
        title: null,
        summary: null,
        error: null,
        modelUsed: null,
      })
      const input = c.req.valid('json')
      return streamOrganize(c, deps, getDump(db, id)!, { text: dump.rawText, ...input })
    })
    .delete('/:id', (c) => {
      const id = c.req.param('id')
      if (activeDumps.has(id)) return c.json({ error: 'The AI is still working on this dump' }, 409)
      const eventIds = listItems(db).filter((i) => i.dumpId === id).map((i) => i.googleEventId)
      if (!deleteDump(db, id)) return c.json({ error: 'Dump not found' }, 404)
      deps.calendar?.eventsOrphaned(eventIds)
      return c.body(null, 204)
    })
}
