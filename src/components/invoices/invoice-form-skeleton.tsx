import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** The editor's two columns, at the heights the real form settles at. */
export function InvoiceFormSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        <Card>
          <CardContent className="grid gap-4 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-64" />
          </CardHeader>
          <CardContent className="grid gap-3">
            {[0, 1].map((row) => (
              <div key={row} className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1fr)_84px_128px_104px_32px] sm:gap-3">
                <Skeleton className="col-span-2 h-9 sm:col-span-1" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="hidden h-9 sm:block" />
              </div>
            ))}
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-20" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
          <div className="grid gap-2.5 border-t border-border pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-1 h-6 w-3/5" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FieldSkeleton() {
  return (
    <div className="grid gap-1.5">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}
