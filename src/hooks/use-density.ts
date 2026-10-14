import { useEffect } from 'react'
import { useLocalSetting } from './use-local-setting'

export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/** Card density, saved per browser. It sets data-density on <html> for the `compact:` CSS variant. */
export function useDensity() {
  const [density, setDensity] = useLocalSetting<Density>('sift:density', 'comfortable', DENSITIES)
  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])
  return [density, setDensity] as const
}
