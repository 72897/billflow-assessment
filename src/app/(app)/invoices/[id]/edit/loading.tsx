import { InvoiceFormSkeleton } from '@/components/invoices/invoice-form-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function EditInvoiceLoading() {
  return (
    <>
      <div className="mb-5 sm:mb-6">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="mt-2.5 h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <InvoiceFormSkeleton />
    </>
  )
}
