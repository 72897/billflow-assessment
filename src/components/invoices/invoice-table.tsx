import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { StatusPill } from '@/components/ui/badge'
import { SortHead } from '@/components/ui/sort-head'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table'
import { dueDescription } from '@/lib/invoice/status'
import { formatMoney } from '@/lib/money'
import { cn, formatDate } from '@/lib/utils'
import type { InvoiceListItem } from '@/types'

export interface InvoiceTableProps {
  invoices: InvoiceListItem[]
  /** Hidden on a client's own page, where every row has the same client. */
  showClient?: boolean
  /** Adds the due-date column; the dashboard's compact table leaves it out. */
  showDueDate?: boolean
  /**
   * Turns the column headers into sort controls. Only the invoice list can
   * honour them - the dashboard and the client page show a fixed slice, and a
   * header that rewrote `?sort=` there would sort a list the user cannot see the
   * rest of.
   */
  sortable?: boolean
  className?: string
}

/**
 * One list of invoices, two layouts.
 *
 * A five-column table is unusable at 375px, so below `sm:` the same rows render
 * as cards. Both are driven from the same array - there is no second query and no
 * chance of the two disagreeing.
 *
 * The whole row is a link rather than just the invoice number: a 44px-tall tap
 * target beats a 12px one, and it means the mobile card and the desktop row
 * behave the same way.
 */
function InvoiceTable({
  invoices,
  showClient = true,
  showDueDate = true,
  sortable = false,
  className,
}: InvoiceTableProps) {
  return (
    <div className={className}>
      <TableWrap className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              {sortable ? (
                <SortHead asc="number_asc" desc="number_desc">
                  Invoice
                </SortHead>
              ) : (
                <TableHead>Invoice</TableHead>
              )}
              {showClient ? <TableHead>Client</TableHead> : null}
              {sortable ? (
                <SortHead asc="oldest" desc="newest" first="desc" fallback="newest">
                  Issued
                </SortHead>
              ) : (
                <TableHead>Issued</TableHead>
              )}
              {showDueDate ? (
                sortable ? (
                  <SortHead asc="due_date" desc="due_date_desc">
                    Due
                  </SortHead>
                ) : (
                  <TableHead>Due</TableHead>
                )
              ) : null}
              {sortable ? (
                <SortHead asc="amount_asc" desc="amount_desc" first="desc" align="right">
                  Amount
                </SortHead>
              ) : (
                <TableHead className="text-right">Amount</TableHead>
              )}
              <TableHead>Status</TableHead>
              <TableHead className="w-8 px-0">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id} interactive>
                <TableCell className="font-medium">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="tabular block transition-colors duration-100 group-hover:text-primary"
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                {showClient ? (
                  <TableCell>
                    <Link href={`/invoices/${invoice.id}`} className="block min-w-0">
                      <span className="block max-w-[16rem] truncate text-[13px] font-medium">{invoice.clientName}</span>
                      {invoice.clientCompany ? (
                        <span className="block max-w-[16rem] truncate text-2xs text-muted-foreground">
                          {invoice.clientCompany}
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground">
                  <Link href={`/invoices/${invoice.id}`} className="block">
                    {formatDate(invoice.issueDate, 'short')}
                  </Link>
                </TableCell>
                {showDueDate ? (
                  <TableCell className="whitespace-nowrap text-[13px]">
                    <Link href={`/invoices/${invoice.id}`} className="block">
                      <span className="block text-muted-foreground">{formatDate(invoice.dueDate, 'short')}</span>
                      <span
                        className={cn(
                          'block text-2xs',
                          invoice.displayStatus === 'overdue' ? 'font-medium text-danger' : 'text-muted-foreground',
                        )}
                      >
                        {dueDescription(invoice)}
                      </span>
                    </Link>
                  </TableCell>
                ) : null}
                <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                  <Link href={`/invoices/${invoice.id}`} className="block">
                    {formatMoney(invoice.total, invoice.currency)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/invoices/${invoice.id}`} className="block">
                    <StatusPill status={invoice.displayStatus} size="sm" />
                  </Link>
                </TableCell>
                <TableCell className="px-0">
                  {/* Decorative: the row already links six times over, so this
                      one is hidden from the tab order and the reading order and
                      exists only to confirm on hover that the row is clickable. */}
                  <Link href={`/invoices/${invoice.id}`} className="block pr-3" tabIndex={-1} aria-hidden>
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>

      <ul className="divide-y divide-border sm:hidden">
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            <Link
              href={`/invoices/${invoice.id}`}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-100 active:bg-secondary"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="tabular text-[13px] font-semibold">{invoice.invoiceNumber}</span>
                  <StatusPill status={invoice.displayStatus} size="sm" />
                </div>
                {showClient ? (
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{invoice.clientName}</p>
                ) : null}
                <p
                  className={cn(
                    'mt-0.5 text-2xs',
                    invoice.displayStatus === 'overdue' ? 'font-medium text-danger' : 'text-muted-foreground',
                  )}
                >
                  {formatDate(invoice.issueDate, 'short')} · {dueDescription(invoice)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="tabular text-[13px] font-semibold">
                  {formatMoney(invoice.total, invoice.currency)}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export { InvoiceTable }
