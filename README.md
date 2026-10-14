# Sift

Sift turns a messy brain dump into **tasks, ideas, reminders and questions**, with priorities, deadlines, tags and subtasks. Paste your thoughts, press **Ctrl+Enter**, and watch the items stream onto a board.

- Live AI sorting (items appear one by one) with Google Gemini 3.5 Flash-Lite (free tier) first, then NVIDIA Nemotron 3 Ultra and Super (free, on OpenRouter) as fallbacks
- Tasks and reminders always get a date. Dates from your text are "stated", AI guesses are "suggested" (shown with `~`)
- Four-column board: drag cards between columns and within a column, edit everything, add items by hand
- Dump history with re-run, filters (dump, tag, priority, urgent, done, search) kept in the URL
- One-click export of the current view to Markdown or JSON
- Voice dictation, `.txt`/`.md` file drop, and a **Ctrl+K** command palette
- Light, dark and system themes; works on phones

Stack: React 19 + Vite, shadcn/ui (Tailwind v4), Bun, Hono, SQLite (Drizzle ORM on `bun:sqlite`), Zod, Gemini API, OpenRouter.

## Setup

1. Install [Bun](https://bun.sh) 1.3 or later.
2. Install the packages:
   ```sh
   bun install
   ```
3. Create your `.env` (git ignores it) and add your keys (one is enough, two give a fallback):
   ```sh
   cp .env.example .env
   ```
   - Gemini: get a free key at <https://aistudio.google.com/apikey> and put it in `GEMINI_API_KEY`.
   - OpenRouter: get a key at <https://openrouter.ai/keys> and put it in `OPENROUTER_API_KEY`.
4. Start the app:
   ```sh
   bun run dev
   ```
   Open <http://localhost:5173>. The API runs on <http://127.0.0.1:3001>.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | (empty) | Your Gemini key. When set, Gemini is tried first. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | The Gemini model. Fastest and most reliable in tests (first item in 3-4 s). `gemini-3.8-flash` is smarter but was often overloaded (503). |
| `GEMINI_REASONING_EFFORT` | `low` | `low` (fastest), `medium`, `high`, or `default`. Gemini 3 cannot turn thinking off. |
| `OPENROUTER_API_KEY` | (empty) | Your OpenRouter key (fallback). With no key at all the app runs, but cannot sort. |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b:free` | The first OpenRouter model |
| `OPENROUTER_FALLBACK_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` | Used when the main model is busy or fails |
| `OPENROUTER_REASONING_EFFORT` | `none` | `none` is fastest (first item in seconds). `low`, `medium`, `high` think first and can take 1 to 2 minutes. |
| `HOST` | `127.0.0.1` | Keep this for local use, so other devices cannot use your key |
| `PORT` | `3001` | API port (Vite forwards `/api` to it) |
| `DATABASE_PATH` | `./data/sift.db` | SQLite file (git ignores `data/`) |
| `APP_PASSWORD` | (empty) | When set, the app asks for this password |

Never give a secret a `VITE_` prefix: Vite copies those variables into the browser code.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Web (Vite) and API (Hono) together, with reload |
| `bun run build` | Type-check and build the web app to `dist/` |
| `bun run start` | Production: one Bun process serves the API and `dist/` |
| `bun test` | Unit and API tests (no network, fake OpenRouter) |
| `bun run typecheck` / `bun run lint` | TypeScript and oxlint |
| `bun run ai:smoke` | Live test against OpenRouter with 6 sample dumps (uses real requests) |
| `bun run db:generate` | Make a migration after a change to `server/db/schema.ts` |

## How the AI part works

1. The browser sends the dump, its clock and its time zone to `POST /api/dumps`.
2. The server asks the model for **JSON Lines**: one JSON object per line. The free Ultra endpoint does not support a JSON response mode, and lines stream better than one big object.
3. A small scanner finds each complete object while the answer streams. Zod checks it, the server fixes small faults (past suggested dates, invented quotes, duplicates), saves it to SQLite and sends it to the browser over Server-Sent Events.
4. The order of tries is Gemini, then Nemotron Ultra (with Super as OpenRouter's own fallback), then Super alone. When a model is busy, slow, rejects the key or returns nothing useful, the server tries the next one. Items that already arrived are kept.

## Free model limits and privacy

- Gemini free-tier limits depend on your account and model (in tests: 5 requests per minute for gemini-3.8-flash). See them at <https://aistudio.google.com/rate-limit>. On the free tier, Google uses your prompts to improve its products.
- OpenRouter free models allow 20 requests per minute and 50 requests per day (1000 per day after you buy 10 credits). One dump or one re-run is one request.
- Free endpoints can log your prompts. Do not put passwords or very private data in a dump.
- If OpenRouter reports a "data policy" error, allow free endpoints at <https://openrouter.ai/settings/privacy>.
- Voice dictation uses the browser speech service: Chrome and Edge send the audio to Google or Microsoft.

## Project layout

```
shared/   Zod schemas, date helpers, filters, export (used by browser and server)
server/   Hono API, Drizzle schema and migrations runner, AI pipeline (server/ai)
src/      React app (components, hooks, shadcn/ui)
drizzle/  SQL migrations
scripts/  ai-smoke.ts and its sample dumps
```

## Running on a server later

Set `HOST=0.0.0.0`, choose a `PORT`, set `APP_PASSWORD`, then run `bun run build && bun run start` behind HTTPS. The app needs a host that runs Bun with a writable disk for the SQLite file (for example a VPS or Fly.io). Static hosts such as Cloudflare Pages cannot run it.

## Install as an app

In production (`bun run build && bun run start`), Sift is a Progressive Web App. In Chrome or Edge, use the install icon in the address bar (or "Install Sift" in the menu). The app shell then opens offline too; your items still come from the Sift server.
