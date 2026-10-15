import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { loginInputSchema } from '../shared/schemas'
import { publicPath, type Env } from './env'
import { validate } from './validate'

const COOKIE = 'sift_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const PUBLIC_PATHS = new Set(['/api/health', '/api/session', '/api/login', '/api/logout', '/api/google/callback'])

/** A stateless session token. A new password makes all old sessions invalid. */
function sessionToken(password: string): string {
  return createHmac('sha256', password).update('sift-session-v1').digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function isAuthenticated(env: Env, cookie: string | undefined): boolean {
  if (!env.APP_PASSWORD) return true
  return cookie !== undefined && safeEqual(cookie, sessionToken(env.APP_PASSWORD))
}

/** Blocks the API when APP_PASSWORD is set and the session cookie is missing or wrong. */
export function requireSession(env: Env): MiddlewareHandler {
  return async (c, next) => {
    if (!env.APP_PASSWORD || PUBLIC_PATHS.has(c.req.path)) return next()
    if (!isAuthenticated(env, getCookie(c, COOKIE))) {
      return c.json({ error: 'Login required' }, 401)
    }
    return next()
  }
}

/** When ORIGIN_KEY is set, only the router (which adds the header) may use the server. */
export function requireOriginKey(env: Env): MiddlewareHandler {
  return async (c, next) => {
    if (!env.ORIGIN_KEY) return next()
    if (!safeEqual(c.req.header('x-sift-origin-key') ?? '', env.ORIGIN_KEY)) {
      return c.text('Forbidden', 403)
    }
    return next()
  }
}

export function authRoutes(env: Env) {
  return new Hono()
    .get('/session', (c) =>
      c.json({
        required: Boolean(env.APP_PASSWORD),
        authenticated: isAuthenticated(env, getCookie(c, COOKIE)),
      }),
    )
    .post('/login', validate('json', loginInputSchema), async (c) => {
      if (!env.APP_PASSWORD) return c.json({ ok: true })
      const { password } = c.req.valid('json')
      if (!safeEqual(sessionToken(password), sessionToken(env.APP_PASSWORD))) {
        // Slow down password guessing.
        await Bun.sleep(600)
        return c.json({ error: 'Wrong password' }, 401)
      }
      setCookie(c, COOKIE, sessionToken(env.APP_PASSWORD), {
        httpOnly: true,
        sameSite: 'Strict',
        // Behind the router the server sees plain HTTP: trust PUBLIC_URL instead.
        secure: new URL(env.PUBLIC_URL ?? c.req.url).protocol === 'https:',
        path: publicPath(env) || '/',
        maxAge: MAX_AGE_SECONDS,
      })
      return c.json({ ok: true })
    })
    .post('/logout', (c) => {
      deleteCookie(c, COOKIE, { path: publicPath(env) || '/' })
      return c.json({ ok: true })
    })
}
