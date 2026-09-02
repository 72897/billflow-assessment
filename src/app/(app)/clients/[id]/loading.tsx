import { Card } from '@/components/ui/card'
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/** Mirrors the detail layout: identity column left, stats and history right. */
export default function ClientDetailLoading() {
  return (
    <>
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-4 w-40" />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
          <div className="hidden gap-2 sm:flex">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 sm:p-5 lg:col-span-1">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          </div>
          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Card key={index} className={index === 2 ? 'col-span-2 p-4 sm:col-span-1' : 'p-4'}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2.5 h-6 w-24" />
                <Skeleton className="mt-2 h-3 w-20" />
              </Card>
            ))}
          </div>

          <Card>
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-28" />
            </div>
            <div className="h-px w-full bg-border" />
            <SkeletonTable rows={4} columns={4} />
          </Card>
        </div>
      </div>
    </>
  )
}
