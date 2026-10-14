import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** A small per-browser setting, shared by every component that uses the same key. */
export function useLocalSetting<T extends string>(key: string, fallback: T, allowed?: readonly T[]) {
  const subscribe = useCallback((fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  const raw = useSyncExternalStore(subscribe, () => read(key))
  const value = raw !== null && (!allowed || allowed.includes(raw as T)) ? (raw as T) : fallback

  const setValue = useCallback(
    (next: T) => {
      try {
        if (next === fallback) localStorage.removeItem(key)
        else localStorage.setItem(key, next)
      } catch {
        /* storage is optional */
      }
      listeners.forEach((fn) => fn())
    },
    [key, fallback],
  )
  return [value, setValue] as const
}
