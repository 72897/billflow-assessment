import { Card } from '@/components/ui/card'
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/** Header, status tabs, filter bar, table — the four bands the real page renders. */
export default function InvoicesLoading() {
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <Card>
        <div className="flex gap-1.5 border-b border-border px-4 py-3 sm:px-5">
          {[14, 16, 15, 20, 14].map((width, index) => (
            <Skeleton key={index} className="h-8" style={{ width: `${width * 4}px` }} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <Skeleton className="h-9 w-full max-w-xs" />
          <Skeleton className="hidden h-9 w-40 sm:block" />
        </div>
        <SkeletonTable rows={8} columns={6} />
      </Card>
    </>
  )
}
