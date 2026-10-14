import { Hono } from 'hono'
import type { Env } from './env'

export type AppDeps = {
  env: Env
}

export function createApp({ env }: AppDeps) {
  const app = new Hono()
  const api = new Hono()

  api.get('/health', (c) =>
    c.json({
      ok: true,
      aiConfigured: Boolean(env.OPENROUTER_API_KEY),
      model: env.OPENROUTER_MODEL,
    }),
  )

  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  return app
}
