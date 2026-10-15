import { describe, expect, test } from 'bun:test'
import { createDump, createItem, getDump, type NewItem } from './db/repo'
import { makeTestApp } from './test-utils'

const baseItem: NewItem = {
  dumpId: null,
  type: 'task',
  title: 'Something',
  details: null,
  priority: 'medium',
  dueDate: null,
  dueTime: null,
  dueSource: null,
  recurrence: null,
  repeatDays: null,
  tags: [],
  sourceQuote: null,
  position: 0,
  subtasks: [],
}

describe('health', () => {
  test('reports when the AI key is missing', async () => {
    const { call } = makeTestApp()
    const res = await call('GET', '/api/health')
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ ok: true, aiConfigured: false })
  })

  test('unknown API paths return a JSON 404', async () => {
    const { call } = makeTestApp()
    const res = await call('GET', '/api/nope')
    expect(res.status).toBe(404)
    expect(res.data).toEqual({ error: 'Not found' })
  })
})

describe('items', () => {
  test('create, list, update and delete an item', async () => {
    const { call } = makeTestApp()

    const created = await call('POST', '/api/items', {
      type: 'task',
      title: '  Call the dentist  ',
      priority: 'high',
      dueDate: '2026-10-16',
      tags: ['#Health', 'health', 'Side Project'],
      subtasks: [{ text: 'Find the number' }, { text: 'Book a slot' }],
    })
    expect(created.status).toBe(201)
    expect(created.data).toMatchObject({
      type: 'task',
      title: 'Call the dentist',
      priority: 'high',
      dueDate: '2026-10-16',
      dueSource: 'stated',
      tags: ['health', 'side-project'],
      status: 'open',
      dumpId: null,
    })
    expect(created.data.subtasks.map((s: any) => s.text)).toEqual(['Find the number', 'Book a slot'])

    const id = created.data.id
    const done = await call('PATCH', `/api/items/${id}`, {
      status: 'done',
      subtasks: [{ text: 'Only step', done: true }],
    })
    expect(done.status).toBe(200)
    expect(done.data.status).toBe('done')
    expect(done.data.completedAt).toBeString()
    expect(done.data.subtasks).toHaveLength(1)
    expect(done.data.subtasks[0]).toMatchObject({ text: 'Only step', done: true })

    const reopened = await call('PATCH', `/api/items/${id}`, { status: 'open', dueDate: null })
    expect(reopened.data.completedAt).toBeNull()
    expect(reopened.data.dueDate).toBeNull()
    expect(reopened.data.dueSource).toBeNull()

    expect((await call('GET', '/api/items')).data).toHaveLength(1)
    expect((await call('DELETE', `/api/items/${id}`)).status).toBe(204)
    expect((await call('DELETE', `/api/items/${id}`)).status).toBe(404)
    expect((await call('GET', '/api/items')).data).toHaveLength(0)
  })

  test('a user-picked date replaces an AI suggestion', async () => {
    const { call, db } = makeTestApp()
    const item = createItem(db, { ...baseItem, dueDate: '2026-10-20', dueSource: 'suggested' })
    const res = await call('PATCH', `/api/items/${item.id}`, { dueDate: '2026-10-25' })
    expect(res.data).toMatchObject({ dueDate: '2026-10-25', dueSource: 'stated' })
  })

  test('new manual items go to the top of their column', async () => {
    const { call } = makeTestApp()
    const first = await call('POST', '/api/items', { type: 'idea', title: 'First' })
    const second = await call('POST', '/api/items', { type: 'idea', title: 'Second' })
    expect(second.data.position).toBeLessThan(first.data.position)
  })

  test('rejects bad input with a readable error', async () => {
    const { call } = makeTestApp()
    const res = await call('POST', '/api/items', { type: 'chore', title: '', dueDate: '2026-02-30' })
    expect(res.status).toBe(400)
    expect(res.data.error).toContain('type')
    expect(res.data.error).toContain('title')
    expect(res.data.error).toContain('dueDate')
  })

  test('PATCH on a missing item returns 404', async () => {
    const { call } = makeTestApp()
    expect((await call('PATCH', '/api/items/missing', { title: 'x' })).status).toBe(404)
  })
})

describe('dumps', () => {
  test('list, get and delete a dump; delete removes its items', async () => {
    const { call, db } = makeTestApp()
    const dump = createDump(db, 'buy milk, call mom')
    createItem(db, {
      ...baseItem,
      dumpId: dump.id,
      title: 'Buy milk',
      sourceQuote: 'buy milk',
      subtasks: [{ text: 'Check the fridge' }],
    })

    const list = await call('GET', '/api/dumps')
    expect(list.data).toHaveLength(1)
    expect(list.data[0]).toMatchObject({ id: dump.id, itemCount: 1, status: 'processing' })

    const one = await call('GET', `/api/dumps/${dump.id}`)
    expect(one.data.rawText).toBe('buy milk, call mom')

    expect((await call('DELETE', `/api/dumps/${dump.id}`)).status).toBe(204)
    expect(getDump(db, dump.id)).toBeNull()
    expect((await call('GET', '/api/items')).data).toHaveLength(0)
  })
})

describe('password', () => {
  test('without APP_PASSWORD the API is open', async () => {
    const { call } = makeTestApp()
    expect((await call('GET', '/api/session')).data).toEqual({ required: false, authenticated: true })
    expect((await call('GET', '/api/items')).status).toBe(200)
  })

  test('with APP_PASSWORD the API needs a session cookie', async () => {
    const { call } = makeTestApp({ env: { APP_PASSWORD: 'hunter2' } })

    expect((await call('GET', '/api/items')).status).toBe(401)
    expect((await call('GET', '/api/health')).status).toBe(200)
    expect((await call('GET', '/api/session')).data).toEqual({ required: true, authenticated: false })

    expect((await call('POST', '/api/login', { password: 'nope' })).status).toBe(401)

    const ok = await call('POST', '/api/login', { password: 'hunter2' })
    expect(ok.status).toBe(200)
    const setCookie = ok.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sift_session=')
    expect(setCookie).toContain('HttpOnly')

    const cookie = setCookie.split(';')[0]!
    expect((await call('GET', '/api/items', undefined, { cookie })).status).toBe(200)
    expect((await call('GET', '/api/session', undefined, { cookie })).data.authenticated).toBe(true)
  })
})

describe('online behind the router', () => {
  const KEY = 'k'.repeat(32)
  const ONLINE = { PUBLIC_URL: 'https://me-momo.co.in/sift/', ORIGIN_KEY: KEY, APP_PASSWORD: 'hunter2' }

  test('without the origin key every request is refused', async () => {
    const { call } = makeTestApp({ env: ONLINE })
    expect((await call('GET', '/api/health')).status).toBe(403)
    expect((await call('GET', '/api/health', undefined, { 'x-sift-origin-key': 'wrong' })).status).toBe(403)
    expect((await call('GET', '/', undefined, {})).status).toBe(403)
    expect((await call('GET', '/api/health', undefined, { 'x-sift-origin-key': KEY })).status).toBe(200)
  })

  test('the session cookie is secure and limited to /sift, also over plain HTTP from the tunnel', async () => {
    const { call } = makeTestApp({ env: ONLINE })
    const ok = await call('POST', 'http://127.0.0.1:3001/api/login', { password: 'hunter2' }, { 'x-sift-origin-key': KEY })
    const setCookie = ok.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('Path=/sift')
    const out = await call('POST', '/api/logout', undefined, { 'x-sift-origin-key': KEY })
    expect(out.headers.get('set-cookie')).toContain('Path=/sift')
  })

  test('a short origin key or a bad public URL is a config error', () => {
    expect(() => makeTestApp({ env: { ORIGIN_KEY: 'short' } })).toThrow('ORIGIN_KEY')
    expect(() => makeTestApp({ env: { PUBLIC_URL: 'ftp://x' } })).toThrow('PUBLIC_URL')
  })
})

describe('repeating items', () => {
  test('marking a repeating item done moves it to the next date and resets steps', async () => {
    const { call } = makeTestApp()
    const today = new Date().toISOString().slice(0, 10)
    const created = await call('POST', '/api/items', {
      type: 'reminder',
      title: 'Pay rent',
      dueDate: today,
      recurrence: 'monthly',
      subtasks: [{ text: 'Open the bank app', done: true }],
    })
    expect(created.data.recurrence).toBe('monthly')

    const res = await call('PATCH', `/api/items/${created.data.id}`, { status: 'done' })
    expect(res.data.status).toBe('open')
    expect(res.data.completedAt).toBeNull()
    expect(res.data.dueDate > today).toBe(true)
    expect(res.data.subtasks[0].done).toBe(false)
  })

  test('without a date there is no repeat, and a normal item is done as usual', async () => {
    const { call } = makeTestApp()
    const created = await call('POST', '/api/items', { type: 'task', title: 'X', recurrence: 'weekly' })
    expect(created.data.recurrence).toBeNull()
    expect((await call('PATCH', `/api/items/${created.data.id}`, { status: 'done' })).data.status).toBe('done')
  })
})

describe('weekly repeats on fixed weekdays', () => {
  test('Mon/Wed/Fri: done moves Mon -> Wed -> Fri -> Mon, as one item', async () => {
    const { call } = makeTestApp()
    // 2099-03-02 is a Monday, safely in the future.
    const created = await call('POST', '/api/items', {
      type: 'task', title: 'Gym', dueDate: '2099-03-02', dueTime: '07:00',
      recurrence: 'weekly', repeatDays: ['fri', 'mon', 'wed', 'mon'],
    })
    expect(created.data).toMatchObject({ recurrence: 'weekly', repeatDays: ['mon', 'wed', 'fri'], dueDate: '2099-03-02' })

    const id = created.data.id
    const dates: string[] = []
    for (let i = 0; i < 3; i++) dates.push((await call('PATCH', `/api/items/${id}`, { status: 'done' })).data.dueDate)
    expect(dates).toEqual(['2099-03-04', '2099-03-06', '2099-03-09'])
    expect((await call('GET', '/api/items')).data).toHaveLength(1)
  })

  test('a due date that is not on a listed day moves to the next listed day', async () => {
    const { call } = makeTestApp()
    // 2099-03-03 is a Tuesday.
    const created = await call('POST', '/api/items', {
      type: 'task', title: 'Swim', dueDate: '2099-03-03', recurrence: 'weekly', repeatDays: ['sat'],
    })
    expect(created.data.dueDate).toBe('2099-03-07')

    const changed = await call('PATCH', `/api/items/${created.data.id}`, { repeatDays: ['thu'] })
    expect(changed.data).toMatchObject({ repeatDays: ['thu'], dueDate: '2099-03-12' })
  })

  test('days are dropped for other repeats', async () => {
    const { call } = makeTestApp()
    const created = await call('POST', '/api/items', {
      type: 'task', title: 'Rent', dueDate: '2099-03-02', recurrence: 'monthly', repeatDays: ['mon'],
    })
    expect(created.data.repeatDays).toBeNull()
    const weekly = await call('PATCH', `/api/items/${created.data.id}`, { recurrence: 'weekly', repeatDays: ['mon', 'thu'] })
    expect(weekly.data.repeatDays).toEqual(['mon', 'thu'])
    const back = await call('PATCH', `/api/items/${created.data.id}`, { recurrence: 'monthly' })
    expect(back.data.repeatDays).toBeNull()
  })
})
