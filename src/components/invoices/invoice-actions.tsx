'use client'

import {
  BellRing,
  CircleCheck,
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Receipt,
  Send,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DeleteInvoiceDialog } from '@/components/invoices/delete-invoice-dialog'
import { RecordPaymentDialog } from '@/components/invoices/record-payment-dialog'
import { ReminderDialog } from '@/components/invoices/reminder-dialog'
import { SendInvoiceDialog } from '@/components/invoices/send-invoice-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toaster'
import { api, errorMessage } from '@/lib/api/client'
import { dueDescription } from '@/lib/invoice/status'
import { cn } from '@/lib/utils'
import type { InvoiceDetail } from '@/types'

export interface InvoiceActionsProps {
  invoice: InvoiceDetail
  /** For the email subject line; the document itself carries the full snapshot. */
  businessName: string
  /** Opens the send dialog on arrival — the editor's "Save and send" lands here. */
  autoSend?: boolean
  className?: string
}

type Sheet = 'send' | 'payment' | 'remind' | 'delete'

/**
 * Everything you can do to one invoice.
 *
 * The bar shows the single action that matches the invoice's state — send a
 * draft, settle a sent invoice, print a receipt for a paid one — and the rest
 * live in the overflow menu. Deciding *for* the user which button is the big one
 * is the whole point: an invoice has one obvious next step at any moment.
 *
 * All four dialogs are mounted here rather than beside their buttons, so the menu
 * can close before a dialog opens without the dialog unmounting with it.
 */
function InvoiceActions({ invoice, businessName, autoSend = false, className }: InvoiceActionsProps) {
  const router = useRouter()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  const status = invoice.displayStatus
  const paid = status === 'paid'
  const unpaidAndSent = status === 'sent' || status === 'overdue'

  // The editor's "Save and send" arrives at `?send=1`. Clearing the flag keeps a
  // refresh from reopening a dialog the user has already dismissed.
  useEffect(() => {
    if (!autoSend) return
    setSheet('send')
    router.replace(`/invoices/${invoice.id}`, { scroll: false })
  }, [autoSend, invoice.id, router])

  async function duplicate() {
    setDuplicating(true)
    try {
      const data = await api.post<{ invoice: InvoiceDetail }>(`/api/invoices/${invoice.id}/duplicate`, {})
      toast.success(`${data.invoice.invoiceNumber} created`, {
        description: `A draft copy of ${invoice.invoiceNumber}, dated today.`,
      })
      router.push(`/invoices/${data.invoice.id}`)
    } catch (caught) {
      toast.error('Could not duplicate this invoice', { description: errorMessage(caught) })
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <>
      <div className={cn('flex items-center gap-2', className)}>
        {paid ? (
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/invoices/${invoice.id}/receipt?download=1`}>
              <Receipt />
              Receipt
            </a>
          </Button>
        ) : unpaidAndSent ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setSheet('remind')}>
              <BellRing />
              Remind
            </Button>
            <Button variant="success" size="sm" onClick={() => setSheet('payment')}>
              <CircleCheck />
              Mark as paid
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            <Button size="sm" onClick={() => setSheet('send')}>
              <Send />
              Send invoice
            </Button>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon-sm" aria-label="More actions" loading={duplicating}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            {unpaidAndSent ? (
              <DropdownMenuItem asChild>
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Pencil />
                  Edit invoice
                </Link>
              </DropdownMenuItem>
            ) : null}

            {paid || unpaidAndSent ? (
              <DropdownMenuItem onSelect={() => setSheet('send')}>
                <Send />
                Send again
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setSheet('payment')}>
                <CircleCheck />
                Mark as paid
              </DropdownMenuItem>
            )}

            <DropdownMenuItem asChild>
              <Link href={`/invoices/${invoice.id}/preview`}>
                <Eye />
                Preview
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <a href={`/api/invoices/${invoice.id}/pdf?download=1`}>
                <Download />
                Download PDF
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => void duplicate()}>
              <Copy />
              Duplicate
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem destructive onSelect={() => setSheet('delete')}>
              <Trash2 />
              {paid ? 'Archive invoice' : 'Delete invoice'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SendInvoiceDialog
        open={sheet === 'send'}
        onOpenChange={(open) => setSheet(open ? 'send' : null)}
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          clientEmail: invoice.clientEmail,
          total: invoice.total,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          sentAt: invoice.sentAt,
          businessName,
        }}
      />

      <RecordPaymentDialog
        open={sheet === 'payment'}
        onOpenChange={(open) => setSheet(open ? 'payment' : null)}
        invoice={invoice}
      />

      <ReminderDialog
        open={sheet === 'remind'}
        onOpenChange={(open) => setSheet(open ? 'remind' : null)}
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          clientEmail: invoice.clientEmail,
          amount: invoice.total,
          currency: invoice.currency,
          dueLabel: dueDescription(invoice),
          reminderCount: invoice.reminderCount,
        }}
      />

      <DeleteInvoiceDialog
        open={sheet === 'delete'}
        onOpenChange={(open) => setSheet(open ? 'delete' : null)}
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          displayStatus: invoice.displayStatus,
          clientName: invoice.clientName,
        }}
        redirectTo="/invoices"
      />
    </>
  )
}

export { InvoiceActions }
