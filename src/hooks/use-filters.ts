import { EMPTY_FILTERS, filtersFromSearch, filtersToSearch, type Filters } from '@shared/view'
import { useCallback, useEffect, useState } from 'react'

/** Board filters, kept in the URL so a view survives a reload and can be bookmarked. */
export function useFilters() {
  const [filters, setFiltersState] = useState<Filters>(() => filtersFromSearch(window.location.search))

  useEffect(() => {
    const onPop = () => setFiltersState(filtersFromSearch(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setFilters = useCallback((update: Partial<Filters>) => {
    setFiltersState((current) => {
      const next = { ...current, ...update }
      const url = `${window.location.pathname}${filtersToSearch(next)}`
      window.history.replaceState(null, '', url)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters])

  return { filters, setFilters, clearFilters }
}
