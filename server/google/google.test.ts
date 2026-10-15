import { describe, expect, test } from 'bun:test'
import type { Item } from '../../shared/schemas'
import { getItem } from '../db/repo'
import { getSetting } from '../db/settings'
import { makeTestApp } from '../test-utils'
import { eventFromItem } from './events'
import { fakeGoogle } from './fake-google'
import { CalendarSync, KEYS } from './sync'

const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'client-1.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-1' }

const baseItem: Item = {
  id: 'i1', dumpId: null, type: 'task', title: 'Gym', details: 'Leg day', priority: 'medium',
  dueDate: '2026-10-16', dueTime: null, dueSource: 'stated', recurrence: null, repeatDays: null,
  googleEventId: null, tags: ['health'], sourceQuote: null, status: 'open', position: 0,
  subtasks: [{ id: 's', text: 'Pack shoes', done: false, position: 0 }],
  createdAt: '', updatedAt: '', completedAt: null,
}

describe('eventFromItem', () => {
  test('a date-only item is an all-day event with the default reminder', () => {
    const event = eventFromItem(baseItem, 'Asia/Kolkata', 15)
    expect(event.start).toEqual({ date: '2026-10-16' })
    expect(event.end).toEqual({ date: '2026-10-17' })
    expect(event.reminders).toEqual({ useDefault: true })
    expect(event.description).toContain('Leg day')
    expect(event.description).toContain('☐ Pack shoes')
    expect(event.description).toContain('Task · medium priority · #health')
    expect(event.extendedProperties.private.siftItemId).toBe('i1')
    expect(event.colorId).toBeUndefined()
  })

  test('a timed, weekly, high-priority item', () => {
    const event = eventFromItem(
      { ...baseItem, dueTime: '23:45', priority: 'high', recurrence: 'weekly', repeatDays: ['mon', 'wed', 'fri'] },
      'Asia/Kolkata',
      15,
    )
    expect(event.start).toEqual({ dateTime: '2026-10-16T23:45:00', timeZone: 'Asia/Kolkata' })
    expect(event.end).toEqual({ dateTime: '2026-10-17T00:15:00', timeZone: 'Asia/Kolkata' })
    expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'])
    expect(event.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] })
    expect(event.colorId).toBe('11')
  })
})

describe('CalendarSync', () => {
  test('create, update, done, repeat, delete: the calendar follows the items', async () => {
    const google = fakeGoogle()
    const base = makeTestApp({ env: GOOGLE_ENV })
    const sync = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    await sync.connect({ access_token: 'access-0', expires_in: 3600, refresh_token: 'refresh-1' }, 'Asia/Kolkata')

    // Use the routes of an app that shares the same db and sync.
    const app = (await import('../app')).createApp({ env: base.env, db: base.db, calendarSync: sync })
    const req = async (method: string, path: string, body?: unknown): Promise<any> => {
      const res = await app.request(path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      })
      return res.status === 204 ? null : res.json()
    }

    const created = await req('POST', '/api/items', { type: 'task', title: 'Dentist', dueDate: '2099-03-02', dueTime: '15:00' })
    const noDate = await req('POST', '/api/items', { type: 'idea', title: 'No date' })
    await sync.idle()

    expect(google.calendars.size).toBe(1)
    expect(getSetting(base.db, KEYS.calendarId)).toBe([...google.calendars][0]!)
    const eventId = getItem(base.db, created.id)!.googleEventId!
    expect(google.events.get(eventId)).toMatchObject({
      summary: 'Dentist',
      start: { dateTime: '2099-03-02T15:00:00', timeZone: 'Asia/Kolkata' },
    })
    expect(getItem(base.db, noDate.id)!.googleEventId).toBeNull()

    // Edits collapse and update the same event.
    await req('PATCH', `/api/items/${created.id}`, { title: 'Dentist (Dr. Rao)' })
    await req('PATCH', `/api/items/${created.id}`, { priority: 'high' })
    await sync.idle()
    expect(google.events.get(eventId)).toMatchObject({ summary: 'Dentist (Dr. Rao)', colorId: '11' })
    expect(google.apiCalls().filter((c) => c.startsWith('PUT'))).toHaveLength(1)

    // Done removes the event.
    await req('PATCH', `/api/items/${created.id}`, { status: 'done' })
    await sync.idle()
    expect(google.events.size).toBe(0)
    expect(getItem(base.db, created.id)!.googleEventId).toBeNull()

    // A repeating item moves its event when done.
    const gym = await req('POST', '/api/items', {
      type: 'task', title: 'Gym', dueDate: '2099-03-02', recurrence: 'weekly', repeatDays: ['mon', 'wed', 'fri'],
    })
    await sync.idle()
    const gymEvent = getItem(base.db, gym.id)!.googleEventId!
    await req('PATCH', `/api/items/${gym.id}`, { status: 'done' })
    await sync.idle()
    expect(google.events.get(gymEvent)).toMatchObject({
      start: { date: '2099-03-04' },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'],
    })

    // Delete removes the event.
    await req('DELETE', `/api/items/${gym.id}`)
    await sync.idle()
    expect(google.events.size).toBe(0)
    expect(getSetting(base.db, KEYS.lastError) ?? '').toBe('')
  })

  test('an event deleted in Google is created again; a deleted calendar is made again', async () => {
    const google = fakeGoogle()
    const base = makeTestApp({ env: GOOGLE_ENV })
    const sync = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    await sync.connect({ access_token: 'access-0', expires_in: 3600, refresh_token: 'refresh-1' }, 'UTC')
    const app = (await import('../app')).createApp({ env: base.env, db: base.db, calendarSync: sync })
    const post = async (body: unknown): Promise<any> => {
      const res = await app.request('/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.json()
    }
    const patch = (id: string, body: unknown) =>
      app.request(`/api/items/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

    const item = await post({ type: 'reminder', title: 'Rent', dueDate: '2099-04-01' })
    await sync.idle()
    const first = getItem(base.db, item.id)!.googleEventId!

    google.events.delete(first) // the user deleted the event in Google Calendar
    await patch(item.id, { title: 'Pay rent' })
    await sync.idle()
    const second = getItem(base.db, item.id)!.googleEventId!
    expect(second).not.toBe(first)
    expect(google.events.get(second)).toMatchObject({ summary: 'Pay rent' })

    google.calendars.clear() // the user deleted the whole "Sift" calendar
    google.events.clear()
    await patch(item.id, { title: 'Pay the rent' })
    await sync.idle()
    expect(google.calendars.size).toBe(1)
    expect(google.events.get(getItem(base.db, item.id)!.googleEventId!)).toMatchObject({ summary: 'Pay the rent' })
  })

  test('syncAll creates missing events and a refresh token gets a new access token', async () => {
    const google = fakeGoogle()
    const base = makeTestApp({ env: GOOGLE_ENV })
    await base.call('POST', '/api/items', { type: 'task', title: 'A', dueDate: '2099-01-01' })
    await base.call('POST', '/api/items', { type: 'task', title: 'B', dueDate: '2099-01-02', dueTime: '09:00' })

    const first = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    await first.connect({ access_token: 'access-0', expires_in: 3600, refresh_token: 'refresh-1' }, 'UTC')
    // A new server process: no access token in memory, only the saved refresh token.
    const restarted = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    expect(await restarted.syncAll()).toEqual({ created: 2, updated: 0, removed: 0 })
    expect(google.calls.some((c) => c.url.endsWith('/token') && c.body.grant_type === 'refresh_token')).toBe(true)
    expect(restarted.status()).toMatchObject({ connected: true, syncedItems: 2, lastError: '' })

    // A second run only updates.
    expect(await restarted.syncAll()).toEqual({ created: 0, updated: 2, removed: 0 })
  })

  test('errors are recorded and do not stop later changes', async () => {
    const google = fakeGoogle()
    const base = makeTestApp({ env: GOOGLE_ENV })
    const sync = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    await sync.connect({ access_token: 'access-0', expires_in: 3600, refresh_token: 'refresh-1' }, 'UTC')
    const app = (await import('../app')).createApp({ env: base.env, db: base.db, calendarSync: sync })
    google.fail((c) => c.method === 'POST' && c.url.endsWith('/calendars'), 503)

    await app.request('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'task', title: 'X', dueDate: '2099-01-01' }) })
    await sync.idle()
    expect(sync.status().lastError).toContain('503')

    await app.request('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'task', title: 'Y', dueDate: '2099-01-02' }) })
    await sync.idle()
    expect(sync.status().lastError).toBe('')
    expect(google.events.size).toBe(1)
  })
})

describe('Google routes', () => {
  test('status and connect without .env values', async () => {
    const { call } = makeTestApp()
    expect((await call('GET', '/api/google/status')).data).toMatchObject({ configured: false, connected: false })
    expect((await call('GET', '/api/google/connect')).status).toBe(400)
  })

  test('the full sign-in: connect redirects to Google, the callback connects and syncs', async () => {
    const google = fakeGoogle()
    const base = makeTestApp({ env: GOOGLE_ENV })
    const sync = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    const app = (await import('../app')).createApp({ env: base.env, db: base.db, calendarSync: sync, fetch: google.fetch })
    await base.call('POST', '/api/items', { type: 'task', title: 'A', dueDate: '2099-01-01' })

    const start = await app.request('/api/google/connect?return=http://localhost:5173/&tz=Asia/Kolkata')
    expect(start.status).toBe(302)
    const auth = new URL(start.headers.get('location')!)
    expect(auth.host).toBe('accounts.google.com')
    expect(auth.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.app.created')
    expect(auth.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3001/api/google/callback')
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256')
    expect(auth.searchParams.get('access_type')).toBe('offline')

    // A wrong state is refused.
    expect((await app.request('/api/google/callback?state=nope&code=x')).status).toBe(400)

    const state = auth.searchParams.get('state')!
    const done = await app.request(`/api/google/callback?state=${state}&code=the-code`)
    expect(done.status).toBe(302)
    expect(done.headers.get('location')).toBe('http://localhost:5173/?google=connected')
    const exchange = google.calls.find((c) => c.url.endsWith('/token'))!
    expect(exchange.body).toMatchObject({ grant_type: 'authorization_code', code: 'the-code' })
    expect(exchange.body.code_verifier).toBeString()

    await sync.idle()
    await Bun.sleep(10)
    await sync.idle()
    expect(sync.status()).toMatchObject({ connected: true, timeZone: 'Asia/Kolkata', syncedItems: 1 })

    // The same state cannot be used twice.
    expect((await app.request(`/api/google/callback?state=${state}&code=again`)).status).toBe(400)

    // Disconnect revokes and forgets.
    const off = await app.request('/api/google/disconnect', { method: 'POST' })
    expect(await off.json()).toMatchObject({ connected: false, syncedItems: 0 })
    expect(google.calls.some((c) => c.url.includes('/revoke'))).toBe(true)
  })

  test('the callback does not need the app password, but connect does', async () => {
    const { call } = makeTestApp({ env: { ...GOOGLE_ENV, APP_PASSWORD: 'pw' } })
    expect((await call('GET', '/api/google/connect')).status).toBe(401)
    expect((await call('GET', '/api/google/callback?state=x')).status).toBe(400)
  })

  test('online, Google returns to PUBLIC_URL with its callback', async () => {
    const env = { ...GOOGLE_ENV, PUBLIC_URL: 'https://me-momo.co.in/sift' }
    const base = makeTestApp({ env })
    const google = fakeGoogle()
    const sync = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    const app = (await import('../app')).createApp({ env: base.env, db: base.db, calendarSync: sync, fetch: google.fetch })
    // The tunnel sends plain HTTP to 127.0.0.1; the browser value is ignored.
    const start = await app.request('http://127.0.0.1:3001/api/google/connect?return=https://evil.example/')
    const auth = new URL(start.headers.get('location')!)
    expect(auth.searchParams.get('redirect_uri')).toBe('https://me-momo.co.in/sift/api/google/callback')
    const res = await app.request(`http://127.0.0.1:3001/api/google/callback?state=${auth.searchParams.get('state')}&error=access_denied`)
    expect(res.headers.get('location')).toStartWith('https://me-momo.co.in/sift/?google=error')
  })

  test('a return URL to another site is not followed', async () => {
    const base = makeTestApp({ env: GOOGLE_ENV })
    const google = fakeGoogle()
    const sync = new CalendarSync({ db: base.db, env: base.env, fetch: google.fetch, delayMs: 0 })
    const app = (await import('../app')).createApp({ env: base.env, db: base.db, calendarSync: sync, fetch: google.fetch })
    const start = await app.request('http://127.0.0.1:3001/api/google/connect?return=https://evil.example/')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const res = await app.request(`http://127.0.0.1:3001/api/google/callback?state=${state}&error=access_denied`)
    expect(res.headers.get('location')).toStartWith('http://127.0.0.1:3001/?google=error')
  })
})

