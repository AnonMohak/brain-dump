import { serveStatic } from 'hono/bun'
import { createApp } from './app'
import { loadEnv } from './env'

const env = loadEnv()
const app = createApp({ env })

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
if (!env.OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is empty. Add it to .env to enable the AI.')
}
