import { cn } from '@/lib/utils'

/** The Sift mark: scattered thoughts (arrows) with their points (dots). White arrows in dark mode. */
export function Logo({ className }: { className?: string }) {
  const size = cn('size-6 shrink-0', className)
  return (
    <>
      <img src="/favicon.png" alt="" aria-hidden="true" className={cn(size, 'dark:hidden')} />
      <img src="/favicon-dark.png" alt="" aria-hidden="true" className={cn(size, 'hidden dark:block')} />
    </>
  )
}
