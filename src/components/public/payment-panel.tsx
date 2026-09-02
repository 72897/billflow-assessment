'use client'

import { CircleCheck, Download, FileText, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PaymentDialog, type PaymentSuccess } from '@/components/public/payment-dialog'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import { dueDescription, type DisplayStatus } from '@/lib/invoice/status'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import type { PublicInvoice } from '@/types'

export interface PaymentPanelProps {
  token: string
  invoiceNumber: string
  businessName: string
  clientName: string
  total: number
  currency: string
  dueDate: string
  status: DisplayStatus
  paidAt: string | null
  payment: PublicInvoice['payment']
}

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  manual: 'Recorded by the sender',
}

/**
 * Screens 17 and 19 — the amount, the Pay button, and the receipt that replaces
 * them both once the money is in.
 *
 * This is the only interactive part of the public page; the invoice underneath it
 * is server-rendered. It takes scalars rather than the whole `PublicInvoice`
 * because every prop on a client component is serialised into the HTML, and the
 * line items are already on the page once.
 *
 * After a payment it swaps to the receipt immediately from the response, then
 * calls `router.refresh()` so the document below picks up its "Paid in full"
 * strip. The local state survives that refresh, so the client never sees the
 * receipt flicker back to a Pay button.
 */
function PaymentPanel({
  token,
  invoiceNumber,
  businessName,
  clientName,
  total,
  currency,
  dueDate,
  status,
  paidAt,
  payment,
}: PaymentPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<PaymentSuccess | null>(null)

  // Either the payment we just made, or the one already on the invoice.
  const settled: PaymentSuccess | null =
    result ??
    (payment
      ? {
          reference: payment.reference,
          amount: payment.amount,
          currency,
          method: payment.method,
          cardLast4: payment.cardLast4,
          paidAt: payment.paidAt,
          alreadyPaid: false,
          receiptSent: false,
        }
      : null)

  const paid = Boolean(settled) || status === 'paid' || Boolean(paidAt)
  const overdue = status === 'overdue'

  function onPaid(success: PaymentSuccess) {
    setResult(success)
    router.refresh()
  }

  if (paid) {
    return (
      <section
        className="rounded-lg border border-success-border bg-success-subtle/60 p-5 shadow-card sm:p-6"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
            <CircleCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold tracking-[-0.01em] sm:text-lg">
              {result ? 'Payment received — thank you' : `Invoice ${invoiceNumber} is paid`}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {settled
                ? `${formatMoney(settled.amount, settled.currency)} paid to ${businessName}. Nothing further is owed on this invoice.`
                : `${formatMoney(total, currency)} paid to ${businessName}. Nothing further is owed on this invoice.`}
            </p>
          </div>
        </div>

        {settled ? (
          <dl className="mt-5 grid gap-2.5 border-t border-success-border pt-4 text-[13px] sm:grid-cols-2">
            <ReceiptRow label="Amount" value={formatMoney(settled.amount, settled.currency)} strong />
            <ReceiptRow label="Invoice" value={invoiceNumber} />
            <ReceiptRow label="Reference" value={settled.reference} />
            <ReceiptRow label="Paid on" value={formatDateTime(settled.paidAt)} />
            <ReceiptRow
              label="Method"
              value={
                settled.cardLast4
                  ? `${METHOD_LABELS[settled.method] ?? 'Card'} ending ${settled.cardLast4}`
                  : (METHOD_LABELS[settled.method] ?? 'Payment')
              }
            />
            <ReceiptRow label="Paid to" value={businessName} />
          </dl>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button asChild>
            <a href={`/api/public/invoices/${token}/receipt?download=1`}>
              <Download />
              Download receipt
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/api/public/invoices/${token}/pdf?download=1`}>
              <FileText />
              Download invoice
            </a>
          </Button>
        </div>

        {settled?.receiptSent ? (
          <p className="mt-3 text-[13px] text-muted-foreground">A copy of the receipt is on its way to your inbox.</p>
        ) : null}
        {settled?.alreadyPaid ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            This invoice was already settled, so nothing was charged again.
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-[-0.01em] sm:text-lg">
              {businessName} sent you an invoice
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              <span className="tabular font-medium text-foreground">{invoiceNumber}</span> for {clientName}
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-5">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Amount due</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              {formatMoney(total, currency)}
            </p>
            <p className={cn('mt-1 text-[13px]', overdue ? 'font-medium text-danger' : 'text-muted-foreground')}>
              {dueDescription({ status: 'sent', dueDate })} · {formatDate(dueDate, 'long')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={() => setOpen(true)}>
              Pay {formatMoney(total, currency)}
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href={`/api/public/invoices/${token}/pdf?download=1`}>
                <Download />
                Download
              </a>
            </Button>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            No card details are collected or stored on this page. Confirming marks the invoice as settled and emails you
            a receipt.
          </span>
        </p>
      </section>

      <PaymentDialog
        open={open}
        onOpenChange={setOpen}
        token={token}
        invoiceNumber={invoiceNumber}
        businessName={businessName}
        total={total}
        currency={currency}
        onPaid={onPaid}
      />
    </>
  )
}

/** One label/value pair in the receipt block. */
function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-start sm:gap-2">
      <dt className="text-muted-foreground sm:min-w-[5.5rem]">{label}</dt>
      <dd className={cn('tabular text-right font-medium sm:text-left', strong && 'font-semibold')}>{value}</dd>
    </div>
  )
}

export { PaymentPanel }
