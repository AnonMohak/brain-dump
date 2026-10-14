import { describe, expect, test } from 'bun:test'
import { toJson } from '../shared/export'
import { EMPTY_FILTERS } from '../shared/view'
import { createDump, createItem, listDumps, listItems, updateDump } from './db/repo'
import { makeTestApp } from './test-utils'

function exportFrom(app: ReturnType<typeof makeTestApp>) {
  return JSON.parse(
    toJson({ items: listItems(app.db), dumps: listDumps(app.db), filters: EMPTY_FILTERS, exportedAt: new Date() }),
  )
}

describe('POST /api/import', () => {
  test('an export imports into an empty board, and a second import adds nothing', async () => {
    const source = makeTestApp()
    const dump = createDump(source.db, 'rent and dentist')
    updateDump(source.db, dump.id, { status: 'done', title: 'Rent and dentist' })
    createItem(source.db, {
      dumpId: dump.id, type: 'reminder', title: 'Pay rent', details: null, priority: 'high',
      dueDate: '2026-11-01', dueTime: null, dueSource: 'stated', recurrence: 'monthly', tags: ['money'],
      sourceQuote: 'rent', position: 0, subtasks: [{ text: 'Open bank app', done: true }],
    })
    await source.call('POST', '/api/items', { type: 'idea', title: 'Hand-made idea' })
    const data = exportFrom(source)

    const target = makeTestApp()
    const first = await target.call('POST', '/api/import', data)
    expect(first.status).toBe(200)
    expect(first.data).toEqual({ dumps: 1, items: 2, skipped: 0 })

    const items = listItems(target.db)
    const rent = items.find((i) => i.title === 'Pay rent')!
    expect(rent).toMatchObject({ dumpId: dump.id, recurrence: 'monthly', dueDate: '2026-11-01', tags: ['money'] })
    expect(rent.subtasks).toMatchObject([{ text: 'Open bank app', done: true }])
    expect(listDumps(target.db)[0]).toMatchObject({ title: 'Rent and dentist', itemCount: 1 })

    const again = await target.call('POST', '/api/import', data)
    expect(again.data).toEqual({ dumps: 0, items: 0, skipped: 3 })
    expect(listItems(target.db)).toHaveLength(2)
  })

  test('accepts an older export without newer fields; unknown dumps become null', async () => {
    const target = makeTestApp()
    const res = await target.call('POST', '/api/import', {
      app: 'sift',
      version: 1,
      exportedAt: '2026-10-14T00:00:00Z',
      filters: { dump: null, tag: null, priority: null, urgent: false, hideDone: false, q: '' },
      dumps: [],
      items: [
        {
          id: 'old-1', dumpId: 'missing-dump', type: 'task', title: 'Old item', details: null, priority: 'low',
          dueDate: null, dueTime: null, dueSource: null, tags: [], sourceQuote: null, status: 'done',
          position: 1, subtasks: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
          completedAt: '2026-10-02T00:00:00Z',
        },
      ],
    })
    expect(res.data).toEqual({ dumps: 0, items: 1, skipped: 0 })
    expect(listItems(target.db)[0]).toMatchObject({ id: 'old-1', dumpId: null, recurrence: null, status: 'done' })
  })

  test('rejects a file that is not a Sift export', async () => {
    const res = await makeTestApp().call('POST', '/api/import', { hello: 'world' })
    expect(res.status).toBe(400)
  })
})
