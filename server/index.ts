import { serveStatic } from 'hono/bun'
import { attemptPlan } from './ai/providers'
import { createApp } from './app'
import { openDb } from './db/client'
import { loadEnv } from './env'

const env = loadEnv()
const db = openDb(env.DATABASE_PATH)
const app = createApp({ env, db })

// In production one process serves the API and the built React app.
if (env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  fetch: app.fetch,
  // AI streams can be quiet while the model thinks. The SSE route also sends pings.
  idleTimeout: 255,
})

console.log(`Sift server: http://${server.hostname}:${server.port}`)
const plan = attemptPlan(env)
if (plan.length === 0) {
  console.warn('GEMINI_API_KEY and OPENROUTER_API_KEY are empty. Add one to .env to enable the AI.')
} else {
  console.log(`AI order: ${plan.map((attempt) => attempt.model).join(' -> ')}`)
}
