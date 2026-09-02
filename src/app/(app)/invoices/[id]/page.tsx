import { ArrowUpRight, Building2, History, Mail, Receipt } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { InvoiceActions } from '@/components/invoices/invoice-actions'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { InvoiceTimeline } from '@/components/invoices/invoice-timeline'
import { ShareLinkCard } from '@/components/invoices/share-link-card'
import { PageHeader } from '@/components/shell/page-header'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUserPage } from '@/lib/auth'
import { publicInvoiceUrl } from '@/lib/config'
import { dueDescription } from '@/lib/invoice/status'
import { formatMoney } from '@/lib/money'
import { findInvoiceDetail } from '@/lib/repositories/invoices'
import { cn, formatDate } from '@/lib/utils'

export const metadata = { title: 'Invoice' }

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  manual: 'Recorded by hand',
}

/**
 * Screen 11 - one invoice.
 *
 * The invoice itself is the page: the same `InvoiceDocument` the client sees on
 * the public link and the same one the PDF renders, so what is on screen is what
 * was billed. Everything around it answers the two questions that bring you here
 * - has it been paid, and has it been seen - and gives you the action that
 * follows from the answer.
 *
 * On a phone the summary and the payment link come first, because chasing money
 * is why you opened this on a phone; the document reads below them.
 */
export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ send?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const user = await requireUserPage(`/invoices/${id}`)

  const invoice = await findInvoiceDetail(user.id, id)
  if (!invoice) notFound()

  const paid = invoice.displayStatus === 'paid'
  const overdue = invoice.displayStatus === 'overdue'
  const payment = invoice.payments.find((entry) => entry.status === 'succeeded') ?? invoice.payments[0] ?? null
  const shareUrl = invoice.publicToken ? publicInvoiceUrl(invoice.publicToken) : null

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Invoices', href: '/invoices' }, { label: invoice.invoiceNumber }]}
        title={
          <span className="flex items-center gap-2.5">
            {invoice.invoiceNumber}
            <StatusPill status={invoice.displayStatus} />
          </span>
        }
        description={
          <>
            {formatMoney(invoice.total, invoice.currency)} · {invoice.clientName} ·{' '}
            <span className={cn(overdue && 'font-medium text-danger')}>{dueDescription(invoice)}</span>
          </>
        }
        actions={
          <InvoiceActions
            invoice={invoice}
            businessName={invoice.business.businessName}
            autoSend={query.send === '1'}
          />
        }
      />

      {invoice.archivedAt ? (
        <Card className="mb-4 border-warning-border bg-warning-subtle px-4 py-3 sm:px-5">
          <p className="text-[13px] text-warning">
            <span className="font-semibold">This invoice is archived.</span> It stays out of your active list and its
            payment link is closed, but it still counts towards your totals.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <Card className="overflow-hidden print:border-0 print:shadow-none">
            <InvoiceDocument invoice={invoice} />
          </Card>

          <Card className="no-print">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" aria-hidden />
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceTimeline events={invoice.events} currency={invoice.currency} />
            </CardContent>
          </Card>
        </div>

        <div className="no-print order-1 space-y-4 lg:order-2">
          <Card>
            <CardContent className="pt-5">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {paid ? 'Paid in full' : 'Amount due'}
              </p>
              <p
                className={cn(
                  'tabular mt-1 text-2xl font-semibold tracking-[-0.02em]',
                  paid && 'text-success',
                  overdue && 'text-danger',
                )}
              >
                {formatMoney(invoice.total, invoice.currency)}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {paid && payment
                  ? `${METHOD_LABELS[payment.method] ?? 'Paid'} · ${formatDate(payment.paidAt)}`
                  : dueDescription(invoice)}
              </p>

              <dl className="mt-4 space-y-2 border-t border-border pt-3.5 text-[13px]">
                <SummaryRow label="Issued" value={formatDate(invoice.issueDate)} />
                <SummaryRow label="Due" value={formatDate(invoice.dueDate)} tone={overdue ? 'danger' : undefined} />
                {invoice.sentAt ? <SummaryRow label="Sent" value={formatDate(invoice.sentAt)} /> : null}
                {invoice.reminderCount > 0 ? (
                  <SummaryRow label="Reminders sent" value={String(invoice.reminderCount)} />
                ) : null}
                {payment?.reference ? <SummaryRow label="Reference" value={payment.reference} /> : null}
              </dl>

              {paid ? (
                <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
                  <a href={`/api/invoices/${invoice.id}/receipt?download=1`}>
                    <Receipt />
                    Download receipt
                  </a>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <ShareLinkCard invoice={invoice} shareUrl={shareUrl} />

          <Card>
            <CardContent className="pt-5">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Billed to</p>
              <Link
                href={`/clients/${invoice.clientId}`}
                className="group mt-2 block rounded-md transition-colors hover:text-primary"
              >
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <span className="truncate">{invoice.clientName}</span>
                  <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
              </Link>
              {invoice.clientCompany ? (
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" aria-hidden />
                  {invoice.clientCompany}
                </p>
              ) : null}
              {invoice.clientEmail ? (
                <a
                  href={`mailto:${invoice.clientEmail}`}
                  className="mt-1 flex items-center gap-1.5 break-all text-[13px] text-muted-foreground transition-colors hover:text-primary"
                >
                  <Mail className="size-3.5 shrink-0" aria-hidden />
                  {invoice.clientEmail}
                </a>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right font-medium', tone === 'danger' && 'text-danger')}>{value}</dd>
    </div>
  )
}
