'use client'

import { Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
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
import { Field, FieldInput, FieldTextarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'
import { ApiError, api, errorMessage, newIdempotencyKey } from '@/lib/api/client'
import { formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/utils'
import type { InvoiceDetail } from '@/types'

export interface SendInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Pick<
    InvoiceDetail,
    'id' | 'invoiceNumber' | 'clientName' | 'clientEmail' | 'total' | 'currency' | 'dueDate' | 'sentAt'
  > & { businessName: string }
}

interface SendResult {
  invoice: InvoiceDetail
  shareUrl: string
  firstSend: boolean
  delivery: { transport: 'resend' | 'outbox'; file: string | null; note: string | null }
}

/**
 * Emails the invoice to the client.
 *
 * The server mints the share link and delivers the message *before* it marks the
 * invoice sent, so a provider failure leaves a draft rather than a lie. That is
 * why a failure here is worth handling properly: the message is editable, still
 * on screen, and the link the email would have carried is offered as a copy
 * button so the send can be completed by hand.
 *
 * Subject and body are pre-filled but editable — the template already contains
 * the number, amount, due date and pay link, so sending it untouched is a
 * complete email.
 */
function SendInvoiceDialog({ open, onOpenChange, invoice }: SendInvoiceDialogProps) {
  const router = useRouter()
  const resend = Boolean(invoice.sentAt)

  const [to, setTo] = useState(invoice.clientEmail)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  // Reopening starts clean, and picks up a client email edited in another tab.
  useEffect(() => {
    if (!open) return
    setTo(invoice.clientEmail)
    setSubject(`Invoice ${invoice.invoiceNumber} from ${invoice.businessName || 'BillFlow'}`)
    setError(null)
    setFieldErrors({})
    setFallbackUrl(null)
  }, [open, invoice.clientEmail, invoice.invoiceNumber, invoice.businessName])

  async function send() {
    setSending(true)
    setError(null)
    setFieldErrors({})
    setFallbackUrl(null)
    try {
      const data = await api.post<SendResult>(`/api/invoices/${invoice.id}/send`, {
        to,
        subject,
        message,
        idempotencyKey: newIdempotencyKey(),
      })

      toast.success(data.firstSend ? `${invoice.invoiceNumber} sent` : `${invoice.invoiceNumber} sent again`, {
        // The outbox transport is not a failure, but pretending an email left
        // when it did not would be — so say where it went, and why, instead.
        description:
          data.delivery.transport === 'outbox'
            ? `${data.delivery.note ?? 'No email provider is configured'} — the invoice is sent and its payment link is live, so copy the link to the client yourself.`
            : `${to} should have it in a moment.`,
        duration: data.delivery.transport === 'outbox' ? 12_000 : undefined,
      })
      setMessage('')
      onOpenChange(false)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof ApiError) {
        const next: Record<string, string> = {}
        for (const [field, messages] of Object.entries(caught.fieldErrors ?? {})) {
          if (messages[0]) next[field] = messages[0]
        }
        setFieldErrors(next)
        if (typeof caught.details?.shareUrl === 'string') setFallbackUrl(caught.details.shareUrl)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={sending ? undefined : onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{resend ? 'Send this invoice again' : 'Send this invoice'}</DialogTitle>
          <DialogDescription>
            {invoice.clientName} gets the invoice as an email, with a link they can pay from.
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
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular font-medium">{formatMoney(invoice.total, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Due</dt>
              <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
            </div>
            {invoice.sentAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Last sent</dt>
                <dd className="font-medium">{formatDate(invoice.sentAt)}</dd>
              </div>
            ) : null}
          </dl>

          <Field label="To" required error={fieldErrors.to}>
            <FieldInput
              type="email"
              autoComplete="off"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="client@example.com"
            />
          </Field>

          <Field label="Subject" required error={fieldErrors.subject}>
            <FieldInput value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} />
          </Field>

          <Field
            label="Message"
            optional
            error={fieldErrors.message}
            hint="The invoice, the amount, the due date and the payment link are added for you."
          >
            <FieldTextarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              placeholder={`Hi ${invoice.clientName.split(' ')[0] || 'there'}, here's the invoice for this month's work. Thanks!`}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} loading={sending} disabled={!to.trim() || !subject.trim()}>
            <Send />
            {sending ? 'Sending…' : resend ? 'Send again' : 'Send invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { SendInvoiceDialog }




