import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the detail layout: the document left, summary and payment link right. */
export default function InvoiceDetailLoading() {
  return (
    <>
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-4 w-44" />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <div className="hidden gap-2 sm:flex">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="size-8" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <Card className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="mt-3 h-3.5 w-40" />
                <Skeleton className="mt-2 h-3.5 w-32" />
              </div>
              <div className="flex flex-col items-end">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-5 w-28" />
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2.5 h-4 w-36" />
                <Skeleton className="mt-2 h-3.5 w-28" />
              </div>
              <div className="space-y-2.5 sm:justify-self-end">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>

            <div className="mt-8 space-y-3 border-t border-border pt-4">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-4 w-full" />
              ))}
            </div>

            <div className="mt-6 space-y-2.5 sm:w-64 sm:justify-self-end">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-4">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="mt-2 h-3 w-28" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <Card className="p-4 sm:p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-8 w-36" />
            <Skeleton className="mt-2 h-3.5 w-28" />
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2.5 h-3.5 w-full" />
            <Skeleton className="mt-4 h-12 w-full" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
