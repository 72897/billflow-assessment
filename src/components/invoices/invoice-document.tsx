/**
 * The invoice itself — the document a client actually reads.
 *
 * One component serves three screens: the owner's detail page, the standalone A4
 * preview, and the public link. They must agree down to the punctuation, because
 * the whole point of a share link is that it shows the same invoice the owner is
 * looking at. The props are typed structurally rather than as `InvoiceDetail`,
 * so `PublicInvoice` — a deliberately narrower payload with no ids, no events
 * and no internal notes — satisfies them too.
 *
 * Everything here is server-rendered: no state, no effects, nothing shipped to
 * the browser. `src/lib/pdf` mirrors this layout for the download; this is the
 * HTML one, and Ctrl-P on it prints a usable invoice.
 */

import { Check } from 'lucide-react'
import { StatusPill } from '@/components/ui/badge'
import { discountLabel } from '@/lib/invoice/calc'
import { formatAmount, formatMoney, formatQuantity, formatRate } from '@/lib/money'
import { cn, formatDate } from '@/lib/utils'
import type { BusinessSnapshot, DiscountType, DisplayStatus, InvoiceItem } from '@/types'

/** Satisfied by both `InvoiceDetail` and `PublicInvoice`. */
export interface InvoiceDocumentData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  displayStatus: DisplayStatus
  currency: string
  subtotal: number
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  notes: string
  items: InvoiceItem[]
  business: BusinessSnapshot
  client: { name: string; company: string; email: string; address: string; phone: string }
  paidAt: string | null
}

export interface InvoiceDocumentProps {
  invoice: InvoiceDocumentData
  /** `page` adds the A4 sheet framing the preview and the public page use. */
  variant?: 'card' | 'page'
  className?: string
}

function InvoiceDocument({ invoice, variant = 'card', className }: InvoiceDocumentProps) {
  const { business, client, currency } = invoice
  const paid = Boolean(invoice.paidAt)

  return (
    <article
      data-print="keep"
      className={cn(
        variant === 'page'
          ? 'mx-auto w-full max-w-[840px] rounded-lg border border-border bg-card p-5 shadow-card sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none'
          : 'p-4 sm:p-6',
        className,
      )}
    >
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          {business.logoUrl ? (
            // A user-uploaded file of unknown dimensions: `object-contain` inside a
            // fixed height keeps a wide wordmark and a square badge equally sane.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logoUrl}
              alt={business.businessName || 'Business logo'}
              className="mb-3 h-10 w-auto max-w-[180px] object-contain"
            />
          ) : null}
          <p className="text-[17px] font-semibold tracking-[-0.01em]">{business.businessName || 'Your business'}</p>
          <DetailLines
            lines={[
              business.address,
              business.businessEmail,
              business.phone,
              business.taxId ? `Tax ID ${business.taxId}` : '',
            ]}
          />
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Invoice</p>
          <p className="tabular mt-1 text-lg font-semibold tracking-[-0.01em]">{invoice.invoiceNumber}</p>
          <div className="mt-2 sm:flex sm:justify-end">
            <StatusPill status={invoice.displayStatus} size="sm" />
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-10">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Billed to</p>
          <p className="mt-1.5 text-sm font-semibold">{client.name}</p>
          {client.company ? <p className="text-[13px] text-muted-foreground">{client.company}</p> : null}
          <DetailLines lines={[client.address, client.email, client.phone]} />
        </div>

        <dl className="grid gap-2 text-[13px] sm:min-w-[13rem]">
          <DocumentRow label="Issue date" value={formatDate(invoice.issueDate)} />
          <DocumentRow label="Due date" value={formatDate(invoice.dueDate)} />
          {paid ? (
            <DocumentRow label="Paid on" value={formatDate(invoice.paidAt)} tone="success" />
          ) : (
            <DocumentRow label="Amount due" value={formatMoney(invoice.total, currency)} strong />
          )}
        </dl>
      </div>

      {invoice.items.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
          No line items yet.
        </p>
      ) : (
        <div className="mt-6">
          <table className="hidden w-full border-collapse text-[13px] sm:table">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(HEAD_CELL, 'pr-3 text-left')}>Description</th>
                <th className={cn(HEAD_CELL, 'w-[80px] px-3 text-right')}>Qty</th>
                <th className={cn(HEAD_CELL, 'w-[124px] px-3 text-right')}>Rate</th>
                <th className={cn(HEAD_CELL, 'w-[132px] pl-3 text-right')}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-border/70 align-top">
                  <td className="py-2.5 pr-3">
                    <span className="block font-medium">{item.description}</span>
                    {item.detail ? (
                      <span className="mt-0.5 block whitespace-pre-line text-muted-foreground">{item.detail}</span>
                    ) : null}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-muted-foreground">
                    {formatQuantity(item.quantity)}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-muted-foreground">
                    {formatAmount(item.rate, currency)}
                  </td>
                  <td className="tabular py-2.5 pl-3 text-right font-medium">{formatAmount(item.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-border border-y border-border sm:hidden">
            {invoice.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium">{item.description}</p>
                  {item.detail ? (
                    <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{item.detail}</p>
                  ) : null}
                  <p className="tabular mt-1 text-2xs text-muted-foreground">
                    {formatQuantity(item.quantity)} × {formatAmount(item.rate, currency)}
                  </p>
                </div>
                <p className="tabular shrink-0 font-semibold">{formatAmount(item.amount, currency)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <dl className="grid w-full gap-2 text-[13px] sm:max-w-[19rem]">
          <DocumentRow label="Subtotal" value={formatAmount(invoice.subtotal, currency)} />
          {invoice.discountAmount > 0 ? (
            <DocumentRow
              label={discountLabel(invoice.discountType, invoice.discountValue)}
              value={`− ${formatAmount(invoice.discountAmount, currency)}`}
              tone="success"
            />
          ) : null}
          {invoice.taxRate > 0 ? (
            <DocumentRow label={`Tax (${formatRate(invoice.taxRate)}%)`} value={formatAmount(invoice.taxAmount, currency)} />
          ) : null}
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
            <dt className="text-sm font-semibold">Total</dt>
            <dd className="tabular text-base font-semibold tracking-[-0.01em]">
              {formatMoney(invoice.total, currency)}
            </dd>
          </div>
        </dl>
      </div>

      {paid ? (
        <p className="mt-5 flex items-center gap-2 rounded-md border border-success-border bg-success-subtle px-3 py-2.5 text-[13px] font-medium text-success">
          <Check className="size-4 shrink-0" aria-hidden />
          Paid in full on {formatDate(invoice.paidAt)} — thank you.
        </p>
      ) : null}

      {invoice.notes ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Notes</p>
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
            {invoice.notes}
          </p>
        </div>
      ) : null}
    </article>
  )
}

const HEAD_CELL = 'py-2 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground'

/** One label/figure pair, in the dates block and again in the totals. */
function DocumentRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'success'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'tabular text-right font-medium',
          strong && 'font-semibold',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** Address block that skips the fields nobody filled in, rather than leaving gaps. */
function DetailLines({ lines }: { lines: Array<string | null | undefined> }) {
  const present = lines.filter((line): line is string => Boolean(line && line.trim()))
  if (present.length === 0) return null

  return (
    <address className="mt-1.5 space-y-0.5 not-italic text-[13px] leading-relaxed text-muted-foreground">
      {present.map((line) => (
        <span key={line} className="block whitespace-pre-line">
          {line}
        </span>
      ))}
    </address>
  )
}

export { InvoiceDocument }




