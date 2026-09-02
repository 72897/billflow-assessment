'use client'

import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'
import { api } from '@/lib/api/client'
import type { DeleteInvoiceResult } from '@/lib/repositories/invoices'
import type { DisplayStatus } from '@/types'

export interface DeleteInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: { id: string; invoiceNumber: string; displayStatus: DisplayStatus; clientName: string }
  /** Where to go once it is gone. Omit to stay put and refresh. */
  redirectTo?: string
}

/**
 * Delete, or archive a paid invoice (INV-13).
 *
 * Three outcomes, and the dialog names the one that applies before the user
 * commits: a draft is deleted, a sent invoice is deleted with a warning that the
 * client keeps their copy, and a paid invoice is archived because deleting it
 * would take money out of the books.
 *
 * `?force=1` goes with the request rather than waiting for the server to refuse
 * once: this dialog *is* the confirmation the flag stands for.
 */
function DeleteInvoiceDialog({ open, onOpenChange, invoice, redirectTo }: DeleteInvoiceDialogProps) {
  const router = useRouter()
  const paid = invoice.displayStatus === 'paid'
  const sent = invoice.displayStatus === 'sent' || invoice.displayStatus === 'overdue'

  async function confirm() {
    const result = await api.del<DeleteInvoiceResult>(`/api/invoices/${invoice.id}${sent ? '?force=1' : ''}`)

    toast.success(
      result.outcome === 'archived'
        ? `${invoice.invoiceNumber} archived`
        : `${invoice.invoiceNumber} deleted`,
      {
        description:
          result.outcome === 'archived'
            ? 'It stays in your records and in your totals, out of the active list.'
            : undefined,
      },
    )

    if (redirectTo) router.push(redirectTo)
    router.refresh()
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={paid ? `Archive ${invoice.invoiceNumber}?` : `Delete ${invoice.invoiceNumber}?`}
      description={
        paid
          ? 'This invoice has been paid, so it is archived instead of deleted — the payment stays in your records.'
          : sent
            ? `${invoice.clientName} has already been sent this invoice. Deleting it removes your copy only.`
            : 'This invoice has never been sent, so nothing leaves your records but this draft. It cannot be undone.'
      }
      confirmLabel={paid ? 'Archive invoice' : 'Delete invoice'}
      onConfirm={confirm}
    >
      {sent ? (
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li>· Their copy of the email, and any PDF they saved, stays with them.</li>
          <li>· The payment link stops working immediately.</li>
          <li>· The invoice number is not reused, so your sequence keeps its gap.</li>
        </ul>
      ) : null}
    </ConfirmDialog>
  )
}

export { DeleteInvoiceDialog }

