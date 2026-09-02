import Link from 'next/link'
import { APP_NAME } from '@/lib/config'
import { cn } from '@/lib/utils'

/**
 * The mark is inline SVG rather than a file: it is three shapes, it inherits
 * `currentColor`, and it costs no request on the critical path.
 */
function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
        <path
          d="M6 4.5h9.2a3.3 3.3 0 0 1 0 6.6H6z"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 11.1h10a3.45 3.45 0 0 1 0 6.9H6z"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.6 2v3M9.6 18v3.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export interface LogoProps {
  href?: string | null
  className?: string
  /** Hides the wordmark, for a collapsed rail. */
  markOnly?: boolean
  size?: 'sm' | 'md'
}

function Logo({ href = '/', className, markOnly = false, size = 'md' }: LogoProps) {
  const content = (
    <>
      <LogoMark className={size === 'sm' ? 'size-7' : undefined} />
      {markOnly ? null : (
        <span className={cn('font-semibold tracking-[-0.02em] text-foreground', size === 'sm' ? 'text-[15px]' : 'text-base')}>
          {APP_NAME}
        </span>
      )}
    </>
  )

  const classes = cn('inline-flex items-center gap-2.5', className)

  if (!href) return <span className={classes}>{content}</span>

  return (
    <Link href={href} className={cn(classes, 'rounded-md transition-opacity hover:opacity-90')}>
      {content}
    </Link>
  )
}

export { Logo, LogoMark }
