import { InvoiceFormSkeleton } from '@/components/invoices/invoice-form-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewInvoiceLoading() {
  return (
    <>
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="mt-2.5 h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <InvoiceFormSkeleton />
    </>
  )
}
