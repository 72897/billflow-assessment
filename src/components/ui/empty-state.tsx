import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  /** The primary way out of the empty state — creating the first thing. */
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Every list needs two different empty states and they are not the same message:
 * "you have no clients yet, here is how to add one" versus "no clients match
 * that search, here is how to clear it". This renders either; the caller decides
 * which by what it passes.
 */
function EmptyState({ icon, title, description, action, secondaryAction, className, size = 'md' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        size === 'md' ? 'py-14' : 'py-10',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground shadow-xs [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className={cn('font-semibold tracking-[-0.01em]', size === 'md' ? 'text-[15px]' : 'text-sm')}>{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState }
