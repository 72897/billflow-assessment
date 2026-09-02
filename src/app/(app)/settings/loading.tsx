import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the settings stack: logo, the business/invoicing form, then the account. */
export default function SettingsLoading() {
  return (
    <>
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />
      </div>

      <div className="grid gap-4">
        <Card className="p-4 sm:p-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2.5 h-3.5 w-72" />
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Skeleton className="h-20 w-32 shrink-0 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <Skeleton className="mt-3 h-3.5 w-full max-w-md" />
        </Card>

        <Card className="p-4 pt-5 sm:p-6">
          {[0, 1].map((set) => (
            <div key={set} className={set === 0 ? '' : 'mt-8'}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3.5 w-full max-w-xl" />

              <div className="mt-5 grid gap-5">
                {[0, 1].map((row) => (
                  <div key={row} className="grid gap-5 sm:grid-cols-2">
                    {[0, 1].map((field) => (
                      <div key={field}>
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="mt-2 h-9 w-full" />
                      </div>
                    ))}
                  </div>
                ))}

                <div>
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="mt-2 h-20 w-full" />
                </div>
              </div>
            </div>
          ))}

          <div className="mt-8 border-t border-border pt-4">
            <Skeleton className="h-9 w-32" />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2.5 h-3.5 w-80" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
        </Card>
      </div>
    </>
  )
}
