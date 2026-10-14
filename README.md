# Sift

Sift turns a messy brain dump into tasks, ideas, reminders and questions, with priorities and deadlines.

Stack: React + Vite, shadcn/ui (Tailwind v4), Bun, Hono, SQLite (Drizzle ORM), Zod, OpenRouter.

## Run locally

```sh
bun install
cp .env.example .env   # then add your OPENROUTER_API_KEY
bun run dev            # web on http://localhost:5173, API on http://127.0.0.1:3001
```
