'use client'

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  title?: string
  description?: React.ReactNode
  error?: unknown
  onRetry?: () => void
  retryLabel?: string
  className?: string
  size?: 'sm' | 'md'
}

/**
 * The failure counterpart to `EmptyState`.
 *
 * An offline browser and a broken server need different words - "check your
 * connection" is useless advice when the connection is fine - so the icon and
 * copy come from the error when one is supplied.
 */
function ErrorState({ title, description, error, onRetry, retryLabel = 'Try again', className, size = 'md' }: ErrorStateProps) {
  const offline = error instanceof ApiError && error.code === 'network_error'
  const message =
    description ??
    (error instanceof ApiError ? error.message : 'Something went wrong while loading this. Please try again.')

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        size === 'md' ? 'py-14' : 'py-10',
        className,
      )}
      role="alert"
    >
      <div
        className={cn(
          'mb-4 flex size-11 items-center justify-center rounded-full [&_svg]:size-5',
          offline ? 'bg-muted text-muted-foreground' : 'bg-danger-subtle text-danger',
        )}
      >
        {offline ? <WifiOff /> : <AlertTriangle />}
      </div>
      <p className={cn('font-semibold tracking-[-0.01em]', size === 'md' ? 'text-[15px]' : 'text-sm')}>
        {title ?? (offline ? 'You appear to be offline' : 'That did not load')}
      </p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

/** The inline version: a strip above a form, for errors with no field to sit on. */
function FormError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] leading-relaxed text-danger',
        className,
      )}
    >
      <AlertTriangle className="mt-px size-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

export { ErrorState, FormError }
