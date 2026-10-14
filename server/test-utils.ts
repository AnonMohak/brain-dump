import { createApp, type AppDeps } from './app'
import { openDb } from './db/client'
import { loadEnv } from './env'

type Overrides = Partial<Omit<AppDeps, 'env' | 'db'>> & { env?: Record<string, string> }

/** A full app on an in-memory SQLite database, plus a small JSON request helper. */
export function makeTestApp(overrides: Overrides = {}) {
  const { env: envOverrides, ...deps } = overrides
  const env = loadEnv({ NODE_ENV: 'test', ...envOverrides })
  const db = openDb(':memory:')
  const app = createApp({ ...deps, env, db })

  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await app.request(path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { status: res.status, data, headers: res.headers }
  }

  return { app, db, env, call }
}
