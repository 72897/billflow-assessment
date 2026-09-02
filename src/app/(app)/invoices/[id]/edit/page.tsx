import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { InvoiceForm } from '@/components/invoices/invoice-form'
import { invoiceToFormValues } from '@/components/invoices/invoice-form-values'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireUserPage } from '@/lib/auth'
import { editPolicy } from '@/lib/invoice/status'
import { listClientOptions } from '@/lib/repositories/clients'
import { findInvoiceDetail } from '@/lib/repositories/invoices'

export const metadata = { title: 'Edit invoice' }

/**
 * Screen 10 - editing an existing invoice.
 *
 * A paid invoice is refused here rather than at save time: a form you are allowed
 * to fill in and then not allowed to submit is a worse experience than being told
 * up front, and duplicating is what you actually wanted. A *sent* invoice does
 * open, because a wrong figure on an unpaid invoice has to be fixable - the form
 * confirms once before it writes.
 */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUserPage(`/invoices/${id}/edit`)

  const [invoice, clients] = await Promise.all([findInvoiceDetail(user.id, id), listClientOptions(user.id)])
  if (!invoice) notFound()

  // `listClientOptions` hides archived clients, and an invoice can outlive one.
  // Without this the select would open on an empty value and quietly reassign the
  // invoice to whoever the user picked instead.
  const clientOptions = clients.some((client) => client.id === invoice.clientId)
    ? clients
    : [
        ...clients,
        {
          id: invoice.client.id,
          name: `${invoice.client.name} (archived)`,
          company: invoice.client.company,
          email: invoice.client.email,
        },
      ]

  const crumbs = [
    { label: 'Invoices', href: '/invoices' },
    { label: invoice.invoiceNumber, href: `/invoices/${invoice.id}` },
    { label: 'Edit' },
  ]

  if (editPolicy(invoice.displayStatus) === 'locked') {
    return (
      <>
        <PageHeader title={`Edit ${invoice.invoiceNumber}`} breadcrumbs={crumbs} />
        <Card>
          <EmptyState
            icon={<AlertTriangle />}
            title="A paid invoice cannot be edited"
            description={`${invoice.invoiceNumber} has been paid, so its figures are now a record of what was charged. Duplicate it to bill ${invoice.clientName} again.`}
            action={
              <Button asChild>
                <Link href={`/invoices/${invoice.id}`}>Back to invoice</Link>
              </Button>
            }
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={`Edit ${invoice.invoiceNumber}`}
        description={
          invoice.displayStatus === 'draft'
            ? 'Nothing has been sent yet, so change whatever you like.'
            : `${invoice.clientName} has already been sent this invoice. Send it again after you save.`
        }
        breadcrumbs={crumbs}
      />

      <InvoiceForm clients={clientOptions} defaultValues={invoiceToFormValues(invoice)} invoice={invoice} />
    </>
  )
}
