import { PageHeader } from '@/components/shell/page-header'
import { ClientForm } from '@/components/clients/client-form'
import { requireUserPage } from '@/lib/auth'

export const metadata = { title: 'Add client' }

/**
 * Screen 6 — add a client.
 *
 * `?returnTo=` lets the invoice editor send someone here to add the client they
 * are missing and get them back to the invoice afterwards. It is validated as a
 * same-site path, because an unchecked one is an open redirect.
 */
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  await requireUserPage('/clients/new')
  const requested = (await searchParams).returnTo
  const candidate = Array.isArray(requested) ? requested[0] : requested
  const returnTo =
    typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : undefined

  return (
    <>
      <PageHeader
        title="Add client"
        description="A name is the only thing you need. Everything else can wait until you have it."
        breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: 'Add client' }]}
      />
      <div className="max-w-3xl">
        <ClientForm returnTo={returnTo} />
      </div>
    </>
  )
}
