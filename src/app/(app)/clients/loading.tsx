import { Card } from '@/components/ui/card'
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/** Header, filter bar, table - the same three bands the real page renders. */
export default function ClientsLoading() {
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <Skeleton className="h-9 w-full max-w-xs" />
          <Skeleton className="hidden h-9 w-36 sm:block" />
        </div>
        <SkeletonTable rows={6} columns={5} />
      </Card>
    </>
  )
}
