import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, CalendarSync, ExternalLink, Link2Off, Loader2, LogIn, RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { itemsKey } from '@/hooks/use-data'
import { api, type GoogleStatus } from '@/lib/api'
import { apiUrl, BASE } from '@/lib/base'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

const statusKey = ['google-status'] as const

/** Starts the Google sign-in in this tab; Google sends the user back with ?google=… */
function connect() {
  const params = new URLSearchParams({
    return: window.location.origin + BASE,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  window.location.assign(`${apiUrl('/google/connect')}?${params}`)
}

/** Shows the result of the Google sign-in once, then removes it from the URL. */
function useSignInResult() {
  const qc = useQueryClient()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const params = new URLSearchParams(window.location.search)
    const result = params.get('google')
    if (!result) return
    if (result === 'connected') {
      toast.success('Google Calendar connected', { description: 'Sift is adding your dated items to the "Sift" calendar.' })
    } else {
      toast.error('Google Calendar was not connected', { description: params.get('googleMessage') ?? undefined })
    }
    params.delete('google')
    params.delete('googleMessage')
    const search = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`)
    void qc.invalidateQueries({ queryKey: statusKey })
  }, [qc])
}

export function GoogleCalendarMenu() {
  const qc = useQueryClient()
  useSignInResult()

  const status = useQuery({
    queryKey: statusKey,
    queryFn: api.googleStatus,
    // While connected, check now and then so the menu and the card icons stay current.
    refetchInterval: (query) => (query.state.data?.connected ? 15_000 : false),
  })

  // New events get their ids in the background: refresh the cards when the count changes.
  const synced = status.data?.syncedItems
  const lastSynced = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (synced !== undefined && lastSynced.current !== undefined && synced !== lastSynced.current) {
      void qc.invalidateQueries({ queryKey: itemsKey })
    }
    lastSynced.current = synced
  }, [synced, qc])

  const syncNow = useMutation({
    mutationFn: api.googleSync,
    onSuccess: (result) => {
      qc.setQueryData<GoogleStatus>(statusKey, result.status)
      void qc.invalidateQueries({ queryKey: itemsKey })
      const changes = result.created + result.updated + result.removed
      toast.success('Google Calendar is up to date', {
        description: changes
          ? `${result.created} added, ${result.updated} updated, ${result.removed} removed.`
          : 'Nothing to change.',
      })
    },
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: statusKey })
      toast.error(error.message)
    },
  })

  const disconnect = useMutation({
    mutationFn: api.googleDisconnect,
    onSuccess: (next) => {
      qc.setQueryData<GoogleStatus>(statusKey, next)
      void qc.invalidateQueries({ queryKey: itemsKey })
      toast('Google Calendar disconnected', { description: 'The events stay in the "Sift" calendar.' })
    },
    onError: (error) => toast.error(error.message),
  })

  const data = status.data
  const error = data?.lastError || null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative text-muted-foreground" aria-label="Google Calendar">
          {data?.connected ? <CalendarCheck2 /> : <CalendarSync />}
          {data?.connected && (
            <span
              className={cn(
                'absolute top-1 right-1 size-1.5 rounded-full',
                error ? 'bg-destructive' : 'bg-emerald-500',
              )}
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <CalendarCheck2 className="size-4 text-muted-foreground" /> Google Calendar
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {!data ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
        ) : !data.configured ? (
          <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
            Not set up. Add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to <code className="font-mono">.env</code>, then
            restart the server.
          </p>
        ) : !data.connected ? (
          <>
            <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
              Sift makes its own "Sift" calendar and keeps your dated items in it. It cannot see your other
              calendars.
            </p>
            <DropdownMenuItem onSelect={connect}>
              <LogIn /> Connect Google Calendar
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <div className="space-y-1 px-2 py-1.5 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{data.syncedItems}</span> item
                {data.syncedItems === 1 ? '' : 's'} in the "{data.calendarName}" calendar
                {data.timeZone ? ` (${data.timeZone})` : ''}.
              </p>
              {data.lastSyncAt && <p>Last full sync {timeAgo(data.lastSyncAt)}.</p>}
              {error && <p className="text-destructive">{error}</p>}
            </div>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                syncNow.mutate()
              }}
              disabled={syncNow.isPending}
            >
              {syncNow.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://calendar.google.com/calendar/r" target="_blank" rel="noreferrer">
                <ExternalLink /> Open Google Calendar
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => disconnect.mutate()}>
              <Link2Off /> Disconnect
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
