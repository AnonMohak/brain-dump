import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'sift:theme'
const listeners = new Set<() => void>()
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Puts the "dark" class on <html>. index.html runs the same logic before the first paint. */
function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

if (typeof window !== 'undefined') {
  media().addEventListener('change', () => {
    if (readTheme() === 'system') apply('system')
    listeners.forEach((fn) => fn())
  })
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme)
  const resolvedTheme = useSyncExternalStore(subscribe, () =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      /* storage is optional */
    }
    apply(next)
    listeners.forEach((fn) => fn())
  }, [])
  return { theme, resolvedTheme, setTheme }
}
