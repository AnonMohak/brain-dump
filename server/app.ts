import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AiTimeouts } from './ai/organize'
import { attemptPlan } from './ai/providers'
import { authRoutes, requireOriginKey, requireSession } from './auth'
import type { Db } from './db/client'
import type { Env } from './env'
import { aiRoutes } from './routes/ai'
import { dumpRoutes } from './routes/dumps'
import { importRoutes } from './routes/import'
import { googleRoutes } from './routes/google'
import { CalendarSync } from './google/sync'
import { itemRoutes } from './routes/items'

export type AppDeps = {
  env: Env
  db: Db
  /** Tests inject this to fake OpenRouter. */
  fetch?: typeof fetch
  aiTimeouts?: Partial<AiTimeouts>
  /** Tests inject a fake Google API through its own fetch. */
  calendarSync?: CalendarSync
}

export function createApp({ env, db, fetch, aiTimeouts, calendarSync }: AppDeps) {
  const app = new Hono()
  app.use('*', requireOriginKey(env))
  const calendar = calendarSync ?? new CalendarSync({ db, env })

  const api = new Hono()
    .use('*', (c, next) =>
      // Imports can hold a whole board; everything else stays small.
      bodyLimit({ maxSize: c.req.path === '/api/import' ? 5 * 1024 * 1024 : 256 * 1024 })(c, next),
    )
    .use('*', requireSession(env))
    .get('/health', (c) => {
      const plan = attemptPlan(env)
      return c.json({
        ok: true,
        aiConfigured: plan.length > 0,
        model: plan[0]?.model ?? null,
        models: plan.map((attempt) => attempt.model),
      })
    })
    .route('/', authRoutes(env))
    .route('/items', itemRoutes(db, calendar))
    .route('/dumps', dumpRoutes({ db, env, fetch, timeouts: aiTimeouts, calendar }))
    .route('/ai', aiRoutes({ db, env, fetch, timeouts: aiTimeouts }))
    .route('/import', importRoutes(db, () => void calendar.syncAll().catch(() => {})))
    .route('/google', googleRoutes({ env, sync: calendar, fetch }))

  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: 'Server error' }, 500)
  })

  return app
}
