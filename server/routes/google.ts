import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import type { Env } from '../env'
import { buildAuthUrl, createPkce, exchangeCode } from '../google/oauth'
import type { CalendarSync } from '../google/sync'

const STATE_TTL_MS = 10 * 60 * 1000

type PendingLogin = { verifier: string; returnTo: string; timeZone: string; expiresAt: number }

/** The callback URL that Google sends the user back to. */
export function redirectUri(env: Env): string {
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI
  return env.PUBLIC_URL ? `${env.PUBLIC_URL}/api/google/callback` : `http://127.0.0.1:${env.PORT}/api/google/callback`
}

/**
 * Only send the browser back to Sift itself. Online that is always PUBLIC_URL;
 * locally it is localhost or the same origin.
 */
function safeReturnTo(value: string | undefined, requestUrl: string, publicUrl?: string): string {
  if (publicUrl) return publicUrl + '/'
  const fallback = new URL('/', requestUrl).toString()
  if (!value) return fallback
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    const same = url.origin === new URL(requestUrl).origin
    return (local || same) && (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin + '/' : fallback
  } catch {
    return fallback
  }
}

function back(returnTo: string, result: string, message?: string): string {
  const url = new URL(returnTo)
  url.searchParams.set('google', result)
  if (message) url.searchParams.set('googleMessage', message.slice(0, 300))
  return url.toString()
}

export function googleRoutes(deps: { env: Env; sync: CalendarSync; fetch?: typeof fetch }) {
  const { env, sync } = deps
  const fetchFn = deps.fetch ?? fetch
  const pending = new Map<string, PendingLogin>()

  return new Hono()
    .get('/status', (c) => c.json(sync.status()))

    /** Starts the Google sign-in. The browser follows the redirect to Google. */
    .get('/connect', (c) => {
      if (!sync.configured) return c.json({ error: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first.' }, 400)
      const now = Date.now()
      for (const [key, value] of pending) if (value.expiresAt < now) pending.delete(key)

      const state = randomBytes(24).toString('base64url')
      const { verifier, challenge } = createPkce()
      pending.set(state, {
        verifier,
        returnTo: safeReturnTo(c.req.query('return'), c.req.url, env.PUBLIC_URL),
        timeZone: c.req.query('tz') || 'UTC',
        expiresAt: now + STATE_TTL_MS,
      })
      return c.redirect(buildAuthUrl({ clientId: env.GOOGLE_CLIENT_ID!, redirectUri: redirectUri(env), state, challenge }))
    })

    /** Google sends the user back here. Public route: the one-time `state` proves the login started here. */
    .get('/callback', async (c) => {
      const state = c.req.query('state') ?? ''
      const login = pending.get(state)
      pending.delete(state)
      if (!login || login.expiresAt < Date.now()) {
        return c.text('This sign-in link is old or unknown. Go back to Sift and click "Connect" again.', 400)
      }
      const error = c.req.query('error')
      if (error) return c.redirect(back(login.returnTo, 'error', error === 'access_denied' ? 'You did not allow access.' : error))

      try {
        const tokens = await exchangeCode(fetchFn, {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          code: c.req.query('code') ?? '',
          verifier: login.verifier,
          redirectUri: redirectUri(env),
        })
        await sync.connect(tokens, login.timeZone)
        // First full sync in the background; the UI shows its progress through /status.
        void sync.syncAll().catch(() => {})
        return c.redirect(back(login.returnTo, 'connected'))
      } catch (err) {
        return c.redirect(back(login.returnTo, 'error', (err as Error).message))
      }
    })

    .post('/sync', async (c) => {
      if (!sync.connected) return c.json({ error: 'Google Calendar is not connected.' }, 400)
      try {
        const counts = await sync.syncAll()
        return c.json({ ...counts, status: sync.status() })
      } catch (err) {
        return c.json({ error: (err as Error).message, status: sync.status() }, 502)
      }
    })

    .post('/disconnect', async (c) => {
      await sync.disconnect()
      return c.json(sync.status())
    })
}
