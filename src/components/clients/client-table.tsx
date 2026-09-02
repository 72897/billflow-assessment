import { ChevronRight, Mail } from 'lucide-react'
import Link from 'next/link'
import { ClientRowActions } from '@/components/clients/client-row-actions'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ClientWithFinancials } from '@/types'

export interface ClientTableProps {
  clients: ClientWithFinancials[]
  /** The user's settings currency; client totals are held in it. */
  currency: string
  className?: string
}

/**
 * The clients list, table above `sm:` and cards below it.
 *
 * Company sits under the name rather than in its own column, the way the invoice
 * table stacks client and company: at 768px a six-column table starts truncating
 * the columns that matter, and a name is read together with its company anyway.
 *
 * Outstanding is the number a freelancer actually scans this list for, so it gets
 * a column and turns red when any of it is overdue.
 */
function ClientTable({ clients, currency, className }: ClientTableProps) {
  return (
    <div className={className}>
      <TableWrap className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Invoices</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const { financials } = client
              return (
                <TableRow key={client.id} interactive>
                  <TableCell>
                    <Link href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-3">
                      <Avatar name={client.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block max-w-[15rem] truncate text-[13px] font-medium">{client.name}</span>
                        {client.company ? (
                          <span className="block max-w-[15rem] truncate text-2xs text-muted-foreground">
                            {client.company}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </TableCell>

                  <TableCell className="text-[13px] text-muted-foreground">
                    {client.email ? (
                      <a
                        href={`mailto:${client.email}`}
                        className="block max-w-[15rem] truncate transition-colors hover:text-primary"
                      >
                        {client.email}
                      </a>
                    ) : (
                      <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">No email</span>
                    )}
                  </TableCell>

                  <TableCell className="tabular text-right text-[13px] text-muted-foreground">
                    <Link href={`/clients/${client.id}`} className="block">
                      {financials.invoiceCount}
                    </Link>
                  </TableCell>

                  <TableCell className="tabular whitespace-nowrap text-right text-[13px] font-medium">
                    <Link href={`/clients/${client.id}`} className="block">
                      {formatMoney(financials.totalBilled, currency)}
                    </Link>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-right">
                    <Link href={`/clients/${client.id}`} className="block">
                      <span
                        className={cn(
                          'tabular text-[13px] font-semibold',
                          financials.totalOutstanding === 0 && 'font-normal text-muted-foreground',
                          financials.overdueCount > 0 && 'text-danger',
                        )}
                      >
                        {formatMoney(financials.totalOutstanding, currency)}
                      </span>
                      {financials.overdueCount > 0 ? (
                        <span className="mt-0.5 block text-2xs font-medium text-danger">
                          {financials.overdueCount} overdue
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>

                  <TableCell className="text-right">
                    <ClientRowActions
                      client={{ id: client.id, name: client.name, invoiceCount: financials.invoiceCount }}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableWrap>

      <ul className="divide-y divide-border sm:hidden">
        {clients.map((client) => (
          <li key={client.id} className="flex items-center">
            <Link href={`/clients/${client.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 active:bg-muted/60">
              <Avatar name={client.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-semibold">{client.name}</span>
                  {client.financials.overdueCount > 0 ? (
                    <Badge tone="danger" size="sm" className="shrink-0">
                      {client.financials.overdueCount} overdue
                    </Badge>
                  ) : null}
                </span>
                {client.company ? (
                  <span className="mt-0.5 block truncate text-2xs text-muted-foreground">{client.company}</span>
                ) : client.email ? (
                  <span className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
                    <Mail className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{client.email}</span>
                  </span>
                ) : null}
                <span className="tabular mt-1 block text-2xs text-muted-foreground">
                  {client.financials.invoiceCount} invoiced ·{' '}
                  <span className={cn(client.financials.totalOutstanding > 0 && 'font-medium text-foreground')}>
                    {formatMoney(client.financials.totalOutstanding, currency)} outstanding
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
            {/* Outside the link, so the row stays one tap target and the menu is another. */}
            <div className="flex size-11 shrink-0 items-center justify-center pr-1">
              <ClientRowActions
                client={{ id: client.id, name: client.name, invoiceCount: client.financials.invoiceCount }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export { ClientTable }
