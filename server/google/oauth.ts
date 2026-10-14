import { createHash, randomBytes } from 'node:crypto'

// Google OAuth 2.0 for an installed ("Desktop app") client with a loopback
// redirect and PKCE: https://developers.google.com/identity/protocols/oauth2/native-app

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/**
 * The narrowest calendar scope: Sift may create its own calendars and manage
 * events in them only. It cannot see or change your other calendars.
 */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'

export class GoogleError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'GoogleError'
    this.status = status
  }
}

const base64url = (buffer: Buffer) => buffer.toString('base64url')

export function createPkce() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthUrl(args: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: 'S256',
    // A refresh token, so sync keeps working without signing in again.
    access_type: 'offline',
    prompt: 'consent',
  }).toString()
  return url.toString()
}

export type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

async function postForm(fetchFn: typeof fetch, url: string, form: Record<string, string>): Promise<any> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const message = data?.error_description ?? data?.error ?? (text || res.statusText)
    throw new GoogleError(`Google sign-in failed: ${message}`, res.status)
  }
  return data
}

export function exchangeCode(
  fetchFn: typeof fetch,
  args: { clientId: string; clientSecret: string; code: string; verifier: string; redirectUri: string },
): Promise<TokenResponse> {
  return postForm(fetchFn, TOKEN_URL, {
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    code_verifier: args.verifier,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri,
  })
}

export function refreshAccessToken(
  fetchFn: typeof fetch,
  args: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<TokenResponse> {
  return postForm(fetchFn, TOKEN_URL, {
    client_id: args.clientId,
    client_secret: args.clientSecret,
    refresh_token: args.refreshToken,
    grant_type: 'refresh_token',
  })
}

export async function revokeToken(fetchFn: typeof fetch, token: string): Promise<void> {
  await fetchFn(REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => {})
}
