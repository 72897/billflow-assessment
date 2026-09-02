import { FileText, Mail, MapPin, Pencil, Phone, Plus, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClientRowActions } from '@/components/clients/client-row-actions'
import { InvoiceTable } from '@/components/invoices/invoice-table'
import { PageHeader } from '@/components/shell/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeaderRow, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireUserPage } from '@/lib/auth'
import { findClient } from '@/lib/repositories/clients'
import { listInvoicesForClient } from '@/lib/repositories/invoices'
import { getSettings } from '@/lib/repositories/settings'
import { formatMoney } from '@/lib/money'
import { cn, pluralise } from '@/lib/utils'

export const metadata = { title: 'Client' }

/**
 * Screen 7 — one client.
 *
 * Two questions get answered above the fold: how to reach them, and what they
 * owe. The invoice history below is the same `InvoiceTable` the list screen uses
 * with `showClient={false}`, since every row here has the same client.
 *
 * A missing id and another user's id both land on `notFound()` — the repository
 * scopes ownership in the WHERE clause, so a foreign id is indistinguishable from
 * a deleted one and nothing leaks about which ids exist (CL-09).
 */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUserPage(`/clients/${id}`)
  const client = await findClient(user.id, id)
  if (!client) notFound()

  const [invoices, settings] = await Promise.all([listInvoicesForClient(user.id, client.id), getSettings(user.id)])
  const { financials } = client
  const currency = settings.currency

  interface ContactLine {
    icon: React.ReactNode
    value: string
    href: string | null
  }

  const contacts: ContactLine[] = []
  if (client.email) contacts.push({ icon: <Mail className="size-4" aria-hidden />, value: client.email, href: `mailto:${client.email}` })
  if (client.phone) contacts.push({ icon: <Phone className="size-4" aria-hidden />, value: client.phone, href: `tel:${client.phone}` })
  if (client.address) contacts.push({ icon: <MapPin className="size-4" aria-hidden />, value: client.address, href: null })

  return (
    <>
      <PageHeader
        title={client.name}
        description={client.company || 'No company on file'}
        breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: client.name }]}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/clients/${client.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            <Button asChild>
              {/* CL-10: the new-invoice screen reads `?client=` and preselects them. */}
              <Link href={`/invoices/new?client=${client.id}`}>
                <Plus />
                New invoice
              </Link>
            </Button>
            <ClientRowActions
              client={{ id: client.id, name: client.name, invoiceCount: financials.invoiceCount }}
              redirectTo="/clients"
              showView={false}
            />
          </>
        }
      />

      {client.archivedAt ? (
        <Card className="mb-4 border-warning-border bg-warning-subtle px-4 py-3 sm:px-5">
          <p className="text-[13px] text-warning">
            <span className="font-semibold">This client is archived.</span> They stay off your active list and out of
            the invoice picker, but their {pluralise(financials.invoiceCount, 'invoice')} still work.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <Avatar name={client.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{client.name}</p>
                  {client.company ? (
                    <p className="truncate text-[13px] text-muted-foreground">{client.company}</p>
                  ) : null}
                </div>
              </div>

              {contacts.length > 0 ? (
                <dl className="mt-4 space-y-2.5 border-t border-border pt-4">
                  {contacts.map((contact) => (
                    <div key={contact.value} className="flex items-start gap-2.5 text-[13px]">
                      <span className="mt-0.5 shrink-0 text-muted-foreground">{contact.icon}</span>
                      {contact.href ? (
                        <a href={contact.href} className="min-w-0 break-words transition-colors hover:text-primary">
                          {contact.value}
                        </a>
                      ) : (
                        <span className="min-w-0 whitespace-pre-line break-words">{contact.value}</span>
                      )}
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 border-t border-border pt-4 text-[13px] text-muted-foreground">
                  No contact details yet.{' '}
                  <Link href={`/clients/${client.id}/edit`} className="font-medium text-primary hover:underline">
                    Add an email
                  </Link>{' '}
                  to send invoices straight from BillFlow.
                </p>
              )}

              <p className="mt-4 border-t border-border pt-3 text-2xs text-muted-foreground">
                Client since {new Date(client.createdAt).getFullYear()}
              </p>
            </CardContent>
          </Card>

          {client.notes ? (
            <Card>
              <CardContent className="pt-5">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <StickyNote className="size-4 text-muted-foreground" aria-hidden />
                  Internal notes
                </p>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                  {client.notes}
                </p>
                <p className="mt-3 text-2xs text-muted-foreground/80">Only you can see this. It never reaches an invoice.</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Billed</p>
              <p className="tabular mt-1.5 text-lg font-semibold tracking-[-0.01em]">
                {formatMoney(financials.totalBilled, currency)}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">{pluralise(financials.invoiceCount, 'invoice')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
              <p className="tabular mt-1.5 text-lg font-semibold tracking-[-0.01em] text-success">
                {formatMoney(financials.totalPaid, currency)}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">{pluralise(financials.paidCount, 'invoice')}</p>
            </Card>
            <Card className="col-span-2 p-4 sm:col-span-1">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
              <p
                className={cn(
                  'tabular mt-1.5 text-lg font-semibold tracking-[-0.01em]',
                  financials.overdueCount > 0 && 'text-danger',
                  financials.totalOutstanding === 0 && 'text-muted-foreground',
                )}
              >
                {formatMoney(financials.totalOutstanding, currency)}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {financials.overdueCount > 0 ? (
                  <span className="font-medium text-danger">{pluralise(financials.overdueCount, 'invoice')} overdue</span>
                ) : financials.outstandingCount > 0 ? (
                  `${pluralise(financials.outstandingCount, 'invoice')} awaiting payment`
                ) : (
                  'Nothing owed'
                )}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeaderRow>
              <div className="flex items-center gap-2">
                <CardTitle>Invoice history</CardTitle>
                {invoices.length > 0 ? (
                  <Badge tone="neutral" size="sm">
                    {invoices.length}
                  </Badge>
                ) : null}
              </div>
              {invoices.length > 0 ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/invoices?client=${client.id}`}>View in invoices</Link>
                </Button>
              ) : null}
            </CardHeaderRow>
            <div className="h-px w-full bg-border" />
            {invoices.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="No invoices yet"
                description={`Nothing has been billed to ${client.name}. Their details are saved, so the first invoice is a few clicks away.`}
                action={
                  <Button asChild>
                    <Link href={`/invoices/new?client=${client.id}`}>
                      <Plus />
                      Create first invoice
                    </Link>
                  </Button>
                }
              />
            ) : (
              <InvoiceTable invoices={invoices} showClient={false} />
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
