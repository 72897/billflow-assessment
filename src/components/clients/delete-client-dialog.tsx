'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError, api } from '@/lib/api/client'
import { pluralise } from '@/lib/utils'
import type { DeleteClientResult } from '@/lib/repositories/clients'

export interface DeleteClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: { id: string; name: string; invoiceCount: number }
  /** Where to go once the client is gone. Omit to stay put and refresh. */
  redirectTo?: string
}

/**
 * Delete, or archive when deleting would destroy history (CL-07, CL-08).
 *
 * A client who has never been invoiced is deleted outright. A client with
 * invoices is archived instead — hard-deleting them would either take paid
 * invoices with it or be refused by the foreign key, and neither is a useful
 * answer. The dialog says which of the two is about to happen *before* the user
 * commits, rather than reporting it afterwards.
 *
 * The invoice count comes from the row that was on screen, so it can be stale by
 * a few seconds. The server is the authority: it answers 409 when the count says
 * zero but an invoice exists, and this retries as an archive so the user gets
 * their outcome instead of an error they cannot act on.
 */
function DeleteClientDialog({ open, onOpenChange, client, redirectTo }: DeleteClientDialogProps) {
  const router = useRouter()
  const [archiving, setArchiving] = useState(client.invoiceCount > 0)

  const archive = archiving || client.invoiceCount > 0

  async function confirm() {
    let result: DeleteClientResult
    try {
      result = await api.del<DeleteClientResult>(`/api/clients/${client.id}${archive ? '?force=1' : ''}`)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'conflict') {
        // Invoices appeared since this page rendered. Switch the dialog to the
        // archive wording and let the user confirm the thing that will work.
        setArchiving(true)
        throw new ApiError(`${error.message} Press Archive client to continue.`, { code: error.code, status: 409 })
      }
      throw error
    }

    toast.success(
      result.outcome === 'archived'
        ? `${client.name} archived — ${pluralise(result.invoiceCount, 'invoice')} kept`
        : `${client.name} deleted`,
    )

    if (redirectTo) router.push(redirectTo)
    router.refresh()
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={archive ? `Archive ${client.name}?` : `Delete ${client.name}?`}
      description={
        archive
          ? `This client has ${pluralise(client.invoiceCount, 'invoice')}, so their record is archived rather than deleted.`
          : 'This client has no invoices, so there is nothing to keep. This cannot be undone.'
      }
      confirmLabel={archive ? 'Archive client' : 'Delete client'}
      onConfirm={confirm}
    >
      {archive ? (
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li>· Every invoice they have, paid or unpaid, stays exactly as it is.</li>
          <li>· They disappear from your client list and from the invoice editor.</li>
          <li>· Reports and totals still include their past invoices.</li>
        </ul>
      ) : null}
    </ConfirmDialog>
  )
}

export { DeleteClientDialog }
