import { safeTimeZone } from '../../shared/dates'
import type { Item } from '../../shared/schemas'
import type { Db } from '../db/client'
import { getItem, listItems } from '../db/repo'
import {
  clearAllEventIds,
  deleteSettings,
  getSetting,
  setItemEventId,
  setSetting,
} from '../db/settings'
import type { Env } from '../env'
import { eventFromItem } from './events'
import { GoogleError, refreshAccessToken, revokeToken, type TokenResponse } from './oauth'

const API = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_NAME = 'Sift'

export const KEYS = {
  refreshToken: 'google.refresh_token',
  calendarId: 'google.calendar_id',
  timeZone: 'google.time_zone',
  lastSyncAt: 'google.last_sync_at',
  lastError: 'google.last_error',
} as const

export type CalendarStatus = {
  /** GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. */
  configured: boolean
  connected: boolean
  calendarName: string
  timeZone: string | null
  lastSyncAt: string | null
  lastError: string | null
  syncedItems: number
}

/** An item gets an event while it is open and has a due date. */
export function wantsEvent(item: Pick<Item, 'status' | 'dueDate'>): boolean {
  return item.status === 'open' && Boolean(item.dueDate)
}

/**
 * Keeps the "Sift" Google calendar in step with the items. Changes are queued
 * and run one at a time in the background; rapid edits to one item collapse
 * into one request. Failures are recorded and shown in the UI; "Sync now"
 * (syncAll) repairs everything.
 */
export class CalendarSync {
  private readonly db: Db
  private readonly env: Env
  private readonly fetchFn: typeof fetch
  private readonly delayMs: number
  private access: { token: string; expiresAt: number } | null = null
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private chain: Promise<unknown> = Promise.resolve()

  constructor(deps: { db: Db; env: Env; fetch?: typeof fetch; delayMs?: number }) {
    this.db = deps.db
    this.env = deps.env
    this.fetchFn = deps.fetch ?? fetch
    this.delayMs = deps.delayMs ?? 800
  }

  get configured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET)
  }

  get connected(): boolean {
    return this.configured && Boolean(getSetting(this.db, KEYS.refreshToken))
  }

  status(): CalendarStatus {
    return {
      configured: this.configured,
      connected: this.connected,
      calendarName: CALENDAR_NAME,
      timeZone: getSetting(this.db, KEYS.timeZone),
      lastSyncAt: getSetting(this.db, KEYS.lastSyncAt),
      lastError: getSetting(this.db, KEYS.lastError),
      syncedItems: listItems(this.db).filter((i) => i.googleEventId).length,
    }
  }

  // ---------- Connect / disconnect ----------

  /** Saves the sign-in from the OAuth callback and creates the calendar. */
  async connect(tokens: TokenResponse, timeZone: string): Promise<void> {
    if (!tokens.refresh_token) {
      throw new GoogleError('Google did not return a refresh token. Remove Sift at myaccount.google.com/permissions and connect again.', null)
    }
    deleteSettings(this.db, 'google.')
    clearAllEventIds(this.db)
    setSetting(this.db, KEYS.refreshToken, tokens.refresh_token)
    setSetting(this.db, KEYS.timeZone, safeTimeZone(timeZone))
    this.access = { token: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
  }

  /** Signs out and forgets the calendar. The events stay in Google Calendar. */
  async disconnect(): Promise<void> {
    const refresh = getSetting(this.db, KEYS.refreshToken)
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    if (refresh) await revokeToken(this.fetchFn, refresh)
    deleteSettings(this.db, 'google.')
    clearAllEventIds(this.db)
    this.access = null
  }

  // ---------- Change hooks (called by routes and the AI pipeline) ----------

  /** Items were created or changed: sync each one soon. */
  itemsChanged(ids: string[]): void {
    if (!this.connected) return
    for (const id of ids) {
      clearTimeout(this.timers.get(id))
      this.timers.set(
        id,
        setTimeout(() => {
          this.timers.delete(id)
          this.enqueue(() => this.syncItem(id))
        }, this.delayMs),
      )
    }
  }

  /** Items were deleted: remove their events. */
  eventsOrphaned(eventIds: (string | null)[]): void {
    if (!this.connected) return
    for (const eventId of eventIds) if (eventId) this.enqueue(() => this.deleteEvent(eventId))
  }

  /** Waits until every queued change has run (used by tests and by "Sync now"). */
  async idle(): Promise<void> {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer)
      this.timers.delete(id)
      this.enqueue(() => this.syncItem(id))
    }
    await this.chain
  }

  // ---------- Full sync ----------

  /** Creates, updates or deletes events so the calendar matches all items. */
  async syncAll(): Promise<{ created: number; updated: number; removed: number }> {
    await this.idle()
    const counts = { created: 0, updated: 0, removed: 0 }
    const run = async () => {
      await this.ensureCalendar()
      for (const item of listItems(this.db)) {
        const result = await this.syncItem(item.id)
        if (result) counts[result]++
      }
      setSetting(this.db, KEYS.lastSyncAt, new Date().toISOString())
    }
    await this.enqueue(run, { rethrow: true })
    return counts
  }

  // ---------- Internals ----------

  private enqueue(task: () => Promise<unknown>, options: { rethrow?: boolean } = {}): Promise<unknown> {
    const next = this.chain.then(async () => {
      try {
        await task()
        setSetting(this.db, KEYS.lastError, '')
      } catch (error) {
        const message = (error as Error).message
        setSetting(this.db, KEYS.lastError, message)
        console.warn(`Google Calendar sync: ${message}`)
        if (options.rethrow) throw error
      }
    })
    // Keep the chain alive after a failure.
    this.chain = next.catch(() => {})
    return next
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt > Date.now()) return this.access.token
    const refreshToken = getSetting(this.db, KEYS.refreshToken)
    if (!refreshToken) throw new GoogleError('Google Calendar is not connected.', null)
    try {
      const tokens = await refreshAccessToken(this.fetchFn, {
        clientId: this.env.GOOGLE_CLIENT_ID!,
        clientSecret: this.env.GOOGLE_CLIENT_SECRET!,
        refreshToken,
      })
      this.access = { token: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
      return this.access.token
    } catch (error) {
      // A revoked or expired sign-in: ask the user to connect again.
      if (error instanceof GoogleError && error.status === 400) {
        throw new GoogleError('The Google sign-in has expired or was removed. Disconnect and connect again.', 401)
      }
      throw error
    }
  }

  private async api(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.accessToken()
    const res = await this.fetchFn(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.status === 204) return null
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      throw new GoogleError(`Google Calendar ${res.status}: ${data?.error?.message ?? res.statusText}`, res.status)
    }
    return data
  }

  private timeZone(): string {
    return getSetting(this.db, KEYS.timeZone) ?? 'UTC'
  }

  /** The id of the "Sift" calendar; creates it when it is missing. */
  private async ensureCalendar(): Promise<string> {
    const saved = getSetting(this.db, KEYS.calendarId)
    if (saved) return saved
    const calendar = await this.api('POST', '/calendars', {
      summary: CALENDAR_NAME,
      description: 'Items from Sift, the brain dump organizer.',
      timeZone: this.timeZone(),
    })
    setSetting(this.db, KEYS.calendarId, calendar.id)
    // A new calendar has none of the old events.
    clearAllEventIds(this.db)
    return calendar.id
  }

  private async withCalendar<T>(work: (calendarId: string) => Promise<T>): Promise<T> {
    const calendarId = await this.ensureCalendar()
    try {
      return await work(calendarId)
    } catch (error) {
      // The user deleted the "Sift" calendar: make a new one and try once more.
      if (error instanceof GoogleError && error.status === 404 && !(await this.calendarExists(calendarId))) {
        deleteSettings(this.db, KEYS.calendarId)
        return work(await this.ensureCalendar())
      }
      throw error
    }
  }

  private async calendarExists(calendarId: string): Promise<boolean> {
    try {
      await this.api('GET', `/calendars/${encodeURIComponent(calendarId)}`)
      return true
    } catch (error) {
      if (error instanceof GoogleError && (error.status === 404 || error.status === 410)) return false
      throw error
    }
  }

  /** Brings one item's event in line with the item. */
  private async syncItem(id: string): Promise<'created' | 'updated' | 'removed' | null> {
    const item = getItem(this.db, id)
    if (!item) return null

    if (!wantsEvent(item)) {
      if (!item.googleEventId) return null
      await this.deleteEvent(item.googleEventId)
      setItemEventId(this.db, item.id, null)
      return 'removed'
    }

    const event = eventFromItem(item, this.timeZone(), this.env.GOOGLE_REMINDER_MINUTES)
    return this.withCalendar(async (calendarId) => {
      const base = `/calendars/${encodeURIComponent(calendarId)}/events`
      if (item.googleEventId) {
        try {
          await this.api('PUT', `${base}/${encodeURIComponent(item.googleEventId)}`, event)
          return 'updated' as const
        } catch (error) {
          // The event was deleted in Google Calendar: create it again.
          if (!(error instanceof GoogleError && (error.status === 404 || error.status === 410))) throw error
          if (!(await this.calendarExists(calendarId))) throw error
        }
      }
      const created = await this.api('POST', base, event)
      setItemEventId(this.db, item.id, created.id)
      return 'created' as const
    })
  }

  private async deleteEvent(eventId: string): Promise<void> {
    const calendarId = getSetting(this.db, KEYS.calendarId)
    if (!calendarId) return
    try {
      await this.api('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
    } catch (error) {
      // Already gone is fine.
      if (error instanceof GoogleError && (error.status === 404 || error.status === 410)) return
      throw error
    }
  }
}
