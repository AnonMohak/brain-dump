import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AiTimeouts } from './ai/organize'
import { attemptPlan } from './ai/providers'
import { authRoutes, requireSession } from './auth'
import type { Db } from './db/client'
import type { Env } from './env'
import { aiRoutes } from './routes/ai'
import { dumpRoutes } from './routes/dumps'
import { itemRoutes } from './routes/items'

export type AppDeps = {
  env: Env
  db: Db
  /** Tests inject this to fake OpenRouter. */
  fetch?: typeof fetch
  aiTimeouts?: Partial<AiTimeouts>
}

export function createApp({ env, db, fetch, aiTimeouts }: AppDeps) {
  const app = new Hono()

  const api = new Hono()
    .use('*', bodyLimit({ maxSize: 256 * 1024 }))
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
    .route('/items', itemRoutes(db))
    .route('/dumps', dumpRoutes({ db, env, fetch, timeouts: aiTimeouts }))
    .route('/ai', aiRoutes({ db, env, fetch, timeouts: aiTimeouts }))

  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: 'Server error' }, 500)
  })

  return app
}
