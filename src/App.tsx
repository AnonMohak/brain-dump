import { useQuery } from '@tanstack/react-query'

type Health = { ok: boolean; aiConfigured: boolean; model: string }

export default function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-3 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sift</h1>
      <p className="text-muted-foreground text-sm">
        {health.isPending && 'Checking the server...'}
        {health.isError && 'The server does not respond.'}
        {health.data &&
          (health.data.aiConfigured
            ? `Server OK. AI model: ${health.data.model}`
            : 'Server OK. Add OPENROUTER_API_KEY to .env to enable the AI.')}
      </p>
    </main>
  )
}
