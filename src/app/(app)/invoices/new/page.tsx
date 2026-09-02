import { InvoiceForm } from '@/components/invoices/invoice-form'
import { newInvoiceValues } from '@/components/invoices/invoice-form-values'
import { PageHeader } from '@/components/shell/page-header'
import type { RawSearchParams } from '@/lib/api/page-params'
import { requireUserPage } from '@/lib/auth'
import { listClientOptions } from '@/lib/repositories/clients'
import { getSettings, peekInvoiceNumber } from '@/lib/repositories/settings'

export const metadata = { title: 'New invoice' }

/**
 * Screen 9 - a blank invoice.
 *
 * The number is *peeked*, not allocated: two tabs open on this page see the same
 * suggestion, and the sequence only advances when one of them saves. That is the
 * right trade - a reserved-then-abandoned number leaves a permanent hole in a
 * book of account, and a duplicate is caught by a unique index and reported on
 * the field.
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requireUserPage('/invoices/new')
  const params = await searchParams

  const [clients, settings, nextInvoiceNumber] = await Promise.all([
    listClientOptions(user.id),
    getSettings(user.id),
    peekInvoiceNumber(user.id),
  ])

  // `?client=` comes from "New invoice" on a client's page. It is checked against
  // this user's own clients, so a guessed or borrowed id preselects nothing.
  const requested = typeof params.client === 'string' ? params.client : undefined
  const presetClientId = clients.some((client) => client.id === requested) ? requested : undefined

  return (
    <>
      <PageHeader
        title="New invoice"
        description="Add your line items and the totals work themselves out."
        breadcrumbs={[{ label: 'Invoices', href: '/invoices' }, { label: 'New invoice' }]}
      />

      <InvoiceForm clients={clients} defaultValues={newInvoiceValues({ settings, nextInvoiceNumber, presetClientId })} />
    </>
  )
}
