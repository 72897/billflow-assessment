import { FileText, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { InvoiceTable } from '@/components/invoices/invoice-table'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { StatusTabs } from '@/components/ui/status-tabs'
import { parseQuery, type RawSearchParams } from '@/lib/api/page-params'
import { requireUserPage } from '@/lib/auth'
import { listClientOptions } from '@/lib/repositories/clients'
import { countInvoicesByStatus, listInvoices } from '@/lib/repositories/invoices'
import { pluralise, truncate } from '@/lib/utils'
import { invoiceListQuerySchema } from '@/lib/validation/invoice'

export const metadata = { title: 'Invoices' }

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'due_date', label: 'Due soonest' },
  { value: 'due_date_desc', label: 'Due latest' },
  { value: 'amount_desc', label: 'Largest amount' },
  { value: 'amount_asc', label: 'Smallest amount' },
  { value: 'number_desc', label: 'Number: high to low' },
  { value: 'number_asc', label: 'Number: low to high' },
] as const

/**
 * Screen 8 - the invoice list.
 *
 * Search, status, client, sort and pagination are all resolved in one SQL
 * statement, deliberately: a large account must not ship every invoice to the
 * browser so the browser can hide most of them. Every filter lives in the URL, so
 * a filtered view can be bookmarked, shared and reloaded, and the back button
 * undoes a filter the way it should.
 */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requireUserPage('/invoices')
  const params = parseQuery(invoiceListQuerySchema, await searchParams)

  const [page, counts, clients] = await Promise.all([
    listInvoices(user.id, params),
    countInvoicesByStatus(user.id, params),
    listClientOptions(user.id),
  ])

  const clientOptions = [
    { value: 'all', label: 'All clients' },
    ...clients.map((client) => ({ value: client.id, label: truncate(client.company || client.name, 28) })),
  ]

  const filtering = Boolean(params.q) || params.status !== 'all' || Boolean(params.client)
  // `counts.all` ignores status but honours search and client, so "nothing here at
  // all" is only true when no filter of any kind is narrowing the list.
  const noInvoicesAtAll = counts.all === 0 && !filtering
  const selectedClient = params.client ? clients.find((client) => client.id === params.client) : undefined

  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          noInvoicesAtAll
            ? 'Everything you have billed, in one list.'
            : `${pluralise(page.total, 'invoice')}${selectedClient ? ` for ${selectedClient.name}` : ''}${
                params.q ? ` matching “${params.q}”` : ''
              }`
        }
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus />
              New invoice
            </Link>
          </Button>
        }
      />

      <Card>
        {noInvoicesAtAll ? (
          <EmptyState
            icon={<FileText />}
            title="No invoices yet"
            description="Create your first invoice and it will show up here, with its status kept up to date on its own."
            action={
              <Button asChild>
                <Link href="/invoices/new">
                  <Plus />
                  Create your first invoice
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <StatusTabs
                tabs={[
                  { value: 'all', label: 'All', count: counts.all },
                  { value: 'draft', label: 'Draft', count: counts.draft },
                  { value: 'sent', label: 'Sent', count: counts.sent },
                  { value: 'overdue', label: 'Overdue', count: counts.overdue },
                  { value: 'paid', label: 'Paid', count: counts.paid },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <SearchInput
                param="q"
                label="Search invoices"
                placeholder="Search number, client or email"
                className="sm:max-w-xs"
              />
              <div className="flex gap-2 sm:ml-auto">
                {clients.length > 1 ? (
                  <FilterSelect
                    param="client"
                    label="Client"
                    options={clientOptions}
                    neutralValue="all"
                    compact
                    className="flex-1 sm:flex-none"
                  />
                ) : null}
                <FilterSelect
                  param="sort"
                  label="Sort"
                  options={SORT_OPTIONS}
                  neutralValue="newest"
                  compact
                  className="flex-1 sm:flex-none"
                />
              </div>
            </div>

            {page.rows.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No invoices match those filters"
                description={
                  params.q ? (
                    <>
                      Nothing matched <span className="font-medium text-foreground">“{params.q}”</span>
                      {params.status !== 'all' ? ` in ${params.status} invoices` : ''}. Try an invoice number or a client
                      name.
                    </>
                  ) : (
                    'Nothing is in this view right now. Clearing the filters shows every invoice again.'
                  )
                }
                action={
                  <Button asChild variant="secondary">
                    <Link href="/invoices">Clear filters</Link>
                  </Button>
                }
                secondaryAction={
                  <Button asChild>
                    <Link href="/invoices/new">
                      <Plus />
                      New invoice
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                <InvoiceTable invoices={page.rows} sortable />
                <Pagination
                  page={page.page}
                  perPage={page.perPage}
                  total={page.total}
                  totalPages={page.totalPages}
                  unit="invoices"
                />
              </>
            )}
          </>
        )}
      </Card>
    </>
  )
}
