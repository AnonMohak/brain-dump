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
| `BASE_PATH` | `/` | Build time only: the path where the app lives, for example `/sift/` |
| `PUBLIC_URL` | (empty) | Online only: the address people open, for example `https://me-momo.co.in/sift`. Sets the Google callback, the return address after sign-in, and a secure cookie for that path. |
| `ORIGIN_KEY` | (empty) | Online only: a long random value. The server answers only requests with this value in the `x-sift-origin-key` header (the router adds it). |

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

## Running on a server

The app needs a host that runs Bun with a writable disk for the SQLite file (for example a VPS). Static hosts such as Cloudflare Pages cannot run it.

Sift can live under a path, for example `https://me-momo.co.in/sift`. A proxy in front (the me-momo-router Worker) removes `/sift` and adds the origin key, so the server itself always uses `/api/...`:

1. Build with the path: `BASE_PATH=/sift/ bun run build`.
2. Set `PUBLIC_URL`, `ORIGIN_KEY` and `APP_PASSWORD` in the server's env file.
3. Run `bun run start` with `HOST=127.0.0.1`. A Cloudflare Tunnel connects the proxy to it, so no port is open.

The `deploy/` folder has the server files for an Ubuntu VM:

| File | Purpose |
|---|---|
| `setup.sh` | One-time setup as root: Bun, the `sift` (app) and `deploy` users, folders, services, swap on small VMs, cloudflared. Safe to run again. |
| `sift.service` | Runs the app (port 3001, local only). Secrets: `/etc/sift/sift.env`. Database: `/var/lib/sift/sift.db`. |
| `sift-deploy.sh` | The only command the GitHub Action's SSH key can run: it takes the built `dist/`, checks out the commit, restarts, checks health, and goes back to the old version on failure. |
| `sift-backup.*` | Nightly SQLite backup at 03:00 India time: 14 days in `/var/backups/sift`, 30 days in Cloudflare R2 (`/etc/sift/backup.env`). |

`.github/workflows/deploy.yml` tests and builds every push to `master`. It deploys only when the repository secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` exist. `.env.production.example` lists the server values.

## Install as an app

In production (`bun run build && bun run start`), Sift is a Progressive Web App. In Chrome or Edge, use the install icon in the address bar (or "Install Sift" in the menu). The app shell then opens offline too; your items still come from the Sift server.

## Google Calendar sync

Sift can keep a calendar called "Sift" in your Google Calendar up to date: open items with a date become events (all-day or timed, with repeats), done items leave the calendar, and every edit, snooze or drag updates the event. The Google Calendar app then reminds you on your phone (timed events: a popup `GOOGLE_REMINDER_MINUTES` before).

Sift asks only for the `calendar.app.created` permission: it can create its own calendar and manage events there, and it cannot see your other calendars.

Setup (once, free):

1. Open <https://console.cloud.google.com/>, create a project (for example "Sift").
2. APIs & Services → Library → enable **Google Calendar API**.
3. APIs & Services → OAuth consent screen (Google Auth Platform): User type **External**, fill in the app name and your email. Under **Audience**, add your Google account as a **test user**. (Testing mode is fine for personal use.)
4. APIs & Services → Credentials → **Create credentials → OAuth client ID** → Application type **Desktop app**. Copy the client ID and the client secret.
5. Put them in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart `bun run dev`.
6. In Sift, open the calendar menu in the header → **Connect Google Calendar**, sign in and allow access.

The sign-in is saved in the local database (`data/`, ignored by git). "Disconnect" in the same menu signs out; the "Sift" calendar and its events stay in Google Calendar until you delete them there. In testing mode Google may ask you to sign in again after 7 days; then use Disconnect and Connect.
