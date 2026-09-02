import { Card } from '@/components/ui/card'
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/**
 * The skeleton mirrors the real layout - three stat cards, a wide chart, a
 * narrow panel, then a table. A placeholder with different proportions makes the
 * page jump when data arrives, which reads as a bug even though nothing is wrong.
 */
export default function DashboardLoading() {
  return (
    <>
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      <div className="grid gap-4 sm:gap-5">
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="p-4 sm:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3.5 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-28" />
            </Card>
          ))}
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-[9.5rem]" />
            </div>
            <Skeleton className="mt-5 h-[220px] w-full sm:h-[248px]" />
          </Card>

          <Card className="p-4 sm:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-48" />
            <div className="mt-5 space-y-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="mt-1.5 h-3 w-40" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-44" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <SkeletonTable rows={5} columns={5} />
        </Card>
      </div>
    </>
  )
}
