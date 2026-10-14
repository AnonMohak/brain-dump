import { useEffect } from 'react'
import { useLocalSetting } from './use-local-setting'

export const ACCENTS = ['violet', 'blue', 'green', 'orange'] as const
export type Accent = (typeof ACCENTS)[number]

/** Swatch colors for the menu (the real values live in index.css). */
export const ACCENT_SWATCH: Record<Accent, string> = {
  violet: 'oklch(0.606 0.25 292.717)',
  blue: 'oklch(0.623 0.214 259.815)',
  green: 'oklch(0.696 0.17 162.48)',
  orange: 'oklch(0.705 0.213 47.604)',
}

/** The accent color, saved per browser. It sets data-accent on <html>. */
export function useAccent() {
  const [accent, setAccent] = useLocalSetting<Accent>('sift:accent', 'violet', ACCENTS)
  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])
  return [accent, setAccent] as const
}
