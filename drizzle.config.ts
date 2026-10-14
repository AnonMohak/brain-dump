import { defineConfig } from 'drizzle-kit'

// `bun run db:generate` writes SQL migrations to ./drizzle.
// The server applies them on start (server/db/client.ts).
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './drizzle',
})
