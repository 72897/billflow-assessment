'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormError } from '@/components/ui/error-state'
import { Field, FieldTextarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'
import { ApiError, api, errorMessage, newIdempotencyKey } from '@/lib/api/client'
import { formatMoney } from '@/lib/money'
import { pluralise } from '@/lib/utils'

export interface ReminderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: {
    id: string
    invoiceNumber: string
    clientName: string
    clientEmail: string
    amount: number
    currency: string
    /** "Due in 3 days" / "12 days overdue" — already worded by the caller. */
    dueLabel: string
    reminderCount: number
  }
}

/**
 * Chase an unpaid invoice.
 *
 * The message box is optional and deliberately empty by default: the email
 * template already contains the invoice number, amount and due date, so an
 * unedited reminder is a complete reminder.
 *
 * If delivery fails the server returns the share link in `details`, and it is
 * offered here — the reminder still needs to reach the client somehow, and a
 * dead end is worse than a copy button.
 */
function ReminderDialog({ open, onOpenChange, invoice }: ReminderDialogProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setFallbackUrl(null)
    }
  }, [open])

  async function send() {
    setSending(true)
    setError(null)
    setFallbackUrl(null)
    try {
      const data = await api.post<{ reminderCount: number; sentTo: string }>(
        `/api/invoices/${invoice.id}/remind`,
        { message, idempotencyKey: newIdempotencyKey() },
      )
      toast.success('Reminder sent', {
        description: `${invoice.invoiceNumber} · ${data.sentTo} · ${pluralise(data.reminderCount, 'reminder')} in total`,
      })
      setMessage('')
      onOpenChange(false)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      const shareUrl = caught instanceof ApiError ? caught.details?.shareUrl : undefined
      if (typeof shareUrl === 'string') setFallbackUrl(shareUrl)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={sending ? undefined : onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Send a reminder</DialogTitle>
          <DialogDescription>
            {invoice.clientName} will get an email about {invoice.invoiceNumber}.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <FormError message={error} />

          {fallbackUrl ? (
            <div className="rounded-md border border-border bg-muted/60 px-3 py-2.5">
              <p className="text-[13px] font-medium">Send the link yourself instead</p>
              <p className="mt-0.5 break-all text-2xs text-muted-foreground">{fallbackUrl}</p>
              <CopyButton value={fallbackUrl} size="sm" className="mt-2" label="Copy payment link" />
            </div>
          ) : null}

          <dl className="grid gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">To</dt>
              <dd className="min-w-0 truncate font-medium">{invoice.clientEmail || 'No email on file'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular font-medium">{formatMoney(invoice.amount, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{invoice.dueLabel}</dd>
            </div>
            {invoice.reminderCount > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Already reminded</dt>
                <dd className="font-medium">{pluralise(invoice.reminderCount, 'time')}</dd>
              </div>
            ) : null}
          </dl>

          <Field
            label="Add a note"
            optional
            hint="The invoice number, amount, due date and payment link are included automatically."
          >
            <FieldTextarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={`Hi ${invoice.clientName.split(' ')[0] ?? 'there'}, just a gentle nudge on this one — let me know if anything needs changing.`}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} loading={sending} disabled={!invoice.clientEmail}>
            <Send />
            {sending ? 'Sending…' : 'Send reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ReminderDialog }
