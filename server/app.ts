import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { authRoutes, requireSession } from './auth'
import type { Db } from './db/client'
import type { Env } from './env'
import { dumpRoutes } from './routes/dumps'
import { itemRoutes } from './routes/items'

export type AppDeps = {
  env: Env
  db: Db
}

export function createApp({ env, db }: AppDeps) {
  const app = new Hono()

  const api = new Hono()
    .use('*', bodyLimit({ maxSize: 256 * 1024 }))
    .use('*', requireSession(env))
    .get('/health', (c) =>
      c.json({
        ok: true,
        aiConfigured: Boolean(env.OPENROUTER_API_KEY),
        model: env.OPENROUTER_MODEL,
      }),
    )
    .route('/', authRoutes(env))
    .route('/items', itemRoutes(db))
    .route('/dumps', dumpRoutes(db))

  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: 'Server error' }, 500)
  })

  return app
}
