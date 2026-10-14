import { cn } from '@/lib/utils'

/** The Sift mark: three lines that get shorter, like thoughts that settle. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-6 shrink-0', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M8 10.5h16M11 16h10M14 21.5h4"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
