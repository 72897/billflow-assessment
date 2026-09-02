import { Plus, Search, Users } from 'lucide-react'
import Link from 'next/link'
import { ClientTable } from '@/components/clients/client-table'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { parseQuery, type RawSearchParams } from '@/lib/api/page-params'
import { requireUserPage } from '@/lib/auth'
import { listClients } from '@/lib/repositories/clients'
import { getSettings } from '@/lib/repositories/settings'
import { pluralise } from '@/lib/utils'
import { clientListQuerySchema } from '@/lib/validation/client'

export const metadata = { title: 'Clients' }

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'billed_desc', label: 'Most billed' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
] as const

/**
 * Screen 5 — the clients list.
 *
 * Search, sort and pagination are all resolved in SQL and all live in the URL,
 * so this page has no client-side filtering to get out of step with the server
 * and no state to lose on a refresh. The two empty states are different
 * messages: "no clients yet" offers the way in, "no matches" offers the way back
 * (CL-04).
 */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requireUserPage('/clients')
  const params = parseQuery(clientListQuerySchema, await searchParams)

  const [page, settings] = await Promise.all([listClients(user.id, params), getSettings(user.id)])
  const searching = Boolean(params.q)
  const noClientsAtAll = page.total === 0 && !searching

  return (
    <>
      <PageHeader
        title="Clients"
        description={
          noClientsAtAll
            ? 'The people and companies you bill.'
            : `${pluralise(page.total, 'client')}${searching ? ` matching “${params.q}”` : ''}`
        }
        actions={
          <Button asChild>
            <Link href="/clients/new">
              <Plus />
              Add client
            </Link>
          </Button>
        }
      />

      <Card>
        {noClientsAtAll ? (
          <EmptyState
            icon={<Users />}
            title="No clients yet"
            description="Add the first person or company you bill. You only need a name to start — everything else can follow."
            action={
              <Button asChild>
                <Link href="/clients/new">
                  <Plus />
                  Add your first client
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <SearchInput
                param="q"
                label="Search clients"
                placeholder="Search name, company or email"
                className="sm:max-w-xs"
              />
              <div className="sm:ml-auto">
                <FilterSelect param="sort" label="Sort" options={SORT_OPTIONS} neutralValue="name_asc" compact />
              </div>
            </div>

            {page.rows.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No clients match that search"
                description={
                  <>
                    Nothing matched <span className="font-medium text-foreground">“{params.q}”</span>. Try part of a
                    name, a company or an email address.
                  </>
                }
                action={
                  <Button asChild variant="secondary">
                    <Link href="/clients">Clear search</Link>
                  </Button>
                }
                secondaryAction={
                  <Button asChild>
                    <Link href="/clients/new">
                      <Plus />
                      Add client
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                <ClientTable clients={page.rows} currency={settings.currency} />
                <Pagination
                  page={page.page}
                  perPage={page.perPage}
                  total={page.total}
                  totalPages={page.totalPages}
                  unit="clients"
                />
              </>
            )}
          </>
        )}
      </Card>
    </>
  )
}
