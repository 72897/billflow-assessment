import { cn } from '@/lib/utils'

/** A shimmering placeholder. `.skeleton` carries the animation (globals.css). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} {...props} />
}

/** One line of fake text. */
function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3.5 w-full rounded', className)} />
}

/**
 * A table's loading state, sized to the real one.
 *
 * Matching the row height and column count matters more than it sounds: if the
 * placeholder is a different shape, content jumps when it resolves, which reads
 * as a bug even though nothing is wrong.
 */
function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full">
      <div className="flex h-10 items-center gap-4 border-b border-border bg-muted/60 px-4">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-2.5 flex-1 rounded" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-3.5 flex-1 rounded', columnIndex === 0 && 'max-w-[9rem]')}
                style={{ opacity: 1 - rowIndex * 0.08 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5 shadow-card', className)}>
      <Skeleton className="h-3 w-24 rounded" />
      <Skeleton className="mt-3.5 h-7 w-32 rounded" />
      <Skeleton className="mt-3 h-3 w-20 rounded" />
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonTable, SkeletonText }
