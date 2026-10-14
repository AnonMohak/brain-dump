// A fake Google OAuth + Calendar API for tests. It keeps calendars and events in memory.

type Call = { method: string; url: string; body: any }

export function fakeGoogle() {
  const calls: Call[] = []
  const calendars = new Set<string>()
  const events = new Map<string, any>() // eventId -> event (with calendarId)
  let nextId = 1
  let tokenCount = 0
  const failures: { match: (c: Call) => boolean; status: number; times: number }[] = []

  const json = (status: number, data: unknown) =>
    new Response(data === null ? null : JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    const raw = init?.body ? String(init.body) : ''
    const body = raw.startsWith('{') ? JSON.parse(raw) : raw ? Object.fromEntries(new URLSearchParams(raw)) : null
    const call = { method, url: url.toString(), body }
    calls.push(call)

    const failure = failures.find((f) => f.times > 0 && f.match(call))
    if (failure) {
      failure.times--
      return json(failure.status, { error: { code: failure.status, message: 'Injected failure' } })
    }

    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
      tokenCount++
      return json(200, {
        access_token: `access-${tokenCount}`,
        expires_in: 3600,
        ...(body.grant_type === 'authorization_code' ? { refresh_token: 'refresh-1' } : {}),
      })
    }
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') return json(200, {})

    const path = url.pathname.replace('/calendar/v3', '')
    if (method === 'POST' && path === '/calendars') {
      const id = `cal-${nextId++}@group.calendar.google.com`
      calendars.add(id)
      return json(200, { id, ...body })
    }
    const calendarMatch = path.match(/^\/calendars\/([^/]+)(?:\/events(?:\/([^/]+))?)?$/)
    if (!calendarMatch) return json(404, { error: { message: 'Unknown path' } })
    const calendarId = decodeURIComponent(calendarMatch[1]!)
    const eventId = calendarMatch[2] ? decodeURIComponent(calendarMatch[2]) : null
    const isEvents = path.includes('/events')
    if (!calendars.has(calendarId)) return json(404, { error: { message: 'Calendar not found' } })

    if (!isEvents && method === 'GET') return json(200, { id: calendarId })
    if (isEvents && method === 'POST' && !eventId) {
      const id = `evt-${nextId++}`
      events.set(id, { ...body, id, calendarId })
      return json(200, { ...body, id })
    }
    if (eventId && !events.has(eventId)) return json(404, { error: { message: 'Not Found' } })
    if (eventId && method === 'PUT') {
      events.set(eventId, { ...body, id: eventId, calendarId })
      return json(200, { ...body, id: eventId })
    }
    if (eventId && method === 'DELETE') {
      events.delete(eventId)
      return new Response(null, { status: 204 })
    }
    return json(400, { error: { message: 'Unsupported' } })
  }) as typeof fetch

  return {
    fetch: fetchFn,
    calls,
    calendars,
    events,
    /** Make the next `times` matching calls fail with `status`. */
    fail(match: (c: Call) => boolean, status: number, times = 1) {
      failures.push({ match, status, times })
    },
    apiCalls: () => calls.filter((c) => c.url.includes('/calendar/v3')).map((c) => `${c.method} ${new URL(c.url).pathname.replace('/calendar/v3', '')}`),
  }
}
