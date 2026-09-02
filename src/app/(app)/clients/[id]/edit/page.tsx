import { notFound } from 'next/navigation'
import { ClientForm } from '@/components/clients/client-form'
import { DeleteClientButton } from '@/components/clients/delete-client-button'
import { PageHeader } from '@/components/shell/page-header'
import { requireUserPage } from '@/lib/auth'
import { findClient } from '@/lib/repositories/clients'

export const metadata = { title: 'Edit client' }

/**
 * Screen 7's edit view — the same `ClientForm`, prefilled.
 *
 * Delete lives here rather than only in the row menu, because this is where
 * someone ends up when they open a client intending to change or remove it. It
 * redirects to the list afterwards: staying on the page of a client who no longer
 * exists would render a 404.
 */
export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUserPage(`/clients/${id}/edit`)
  const client = await findClient(user.id, id)
  if (!client) notFound()

  return (
    <>
      <PageHeader
        title="Edit client"
        description="Changes apply to new invoices. Invoices already sent keep the details they were issued with."
        breadcrumbs={[
          { label: 'Clients', href: '/clients' },
          { label: client.name, href: `/clients/${client.id}` },
          { label: 'Edit' },
        ]}
      />
      <div className="max-w-3xl">
        <ClientForm
          client={client}
          danger={
            <DeleteClientButton
              client={{ id: client.id, name: client.name, invoiceCount: client.financials.invoiceCount }}
              redirectTo="/clients"
            />
          }
        />
      </div>
    </>
  )
}
