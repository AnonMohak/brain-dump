import type { CreateItemInput, Dump, Item, UpdateItemInput } from '@shared/schemas'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json', ...init.headers } : init.headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const json = (body: unknown) => JSON.stringify(body)

export type Health = { ok: boolean; aiConfigured: boolean; model: string | null; models: string[] }
export type Session = { required: boolean; authenticated: boolean }

export const api = {
  health: () => request<Health>('/health'),
  session: () => request<Session>('/session'),
  login: (password: string) => request<{ ok: true }>('/login', { method: 'POST', body: json({ password }) }),
  logout: () => request<{ ok: true }>('/logout', { method: 'POST' }),

  items: () => request<Item[]>('/items'),
  createItem: (input: CreateItemInput) =>
    request<Item>('/items', { method: 'POST', body: json(input) }),
  updateItem: (id: string, patch: UpdateItemInput) =>
    request<Item>(`/items/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),

  dumps: () => request<Dump[]>('/dumps'),
  deleteDump: (id: string) => request<void>(`/dumps/${id}`, { method: 'DELETE' }),
}
