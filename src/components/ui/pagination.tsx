'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface PaginationProps {
  page: number
  perPage: number
  total: number
  totalPages: number
  /** Plural noun for the count line: "invoices", "clients". */
  unit?: string
  className?: string
}

/**
 * Links, not buttons.
 *
 * Paging is part of the URL because filtering happens on the server: a link is
 * shareable, survives a refresh, and gives the browser a real back button. The
 * component reads the current query itself and only replaces `page`, so it never
 * drops a search term or a status filter.
 */
function Pagination({ page, perPage, total, totalPages, unit = 'results', className }: PaginationProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (total === 0) return null

  const href = (target: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (target <= 1) params.delete('page')
    else params.set('page', String(target))
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  const first = (page - 1) * perPage + 1
  const last = Math.min(page * perPage, total)

  return (
    <div
      className={cn(
        'flex flex-col-reverse items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row sm:px-5',
        className,
      )}
    >
      <p className="text-[13px] text-muted-foreground">
        Showing <span className="font-medium text-foreground">{first}</span>-
        <span className="font-medium text-foreground">{last}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span> {unit}
      </p>

      {totalPages > 1 ? (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
            <ChevronLeft />
          </PageLink>

          {pageWindow(page, totalPages).map((entry, index) =>
            entry === null ? (
              <span key={`gap-${index}`} className="px-1.5 text-sm text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <PageLink key={entry} href={href(entry)} current={entry === page} label={`Page ${entry}`}>
                {entry}
              </PageLink>
            ),
          )}

          <PageLink href={href(page + 1)} disabled={page >= totalPages} label="Next page">
            <ChevronRight />
          </PageLink>
        </nav>
      ) : null}
    </div>
  )
}

function PageLink({
  href,
  children,
  disabled,
  current,
  label,
}: {
  href: string
  children: React.ReactNode
  disabled?: boolean
  current?: boolean
  label: string
}) {
  const className = cn(
    'inline-flex h-8 min-w-8 select-none items-center justify-center rounded-md border px-2 text-[13px] font-medium shadow-xs transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-quint active:translate-y-px [&_svg]:size-4',
    current
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-foreground hover:border-border-strong hover:bg-secondary active:bg-muted active:shadow-none',
    disabled && 'pointer-events-none opacity-40 shadow-none',
  )

  if (disabled) {
    return (
      <span className={className} aria-disabled aria-label={label}>
        {children}
      </span>
    )
  }

  return (
    <Link href={href} className={className} aria-label={label} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  )
}

/**
 * Page numbers around the current one, with `null` marking an ellipsis. Keeps
 * the control a fixed width however many pages there are, so it does not reflow
 * as you move through a long list.
 */
function pageWindow(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1])
  if (page <= 3) [2, 3, 4].forEach((value) => pages.add(value))
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((value) => pages.add(value))

  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)
  const result: Array<number | null> = []
  let previous = 0
  for (const value of sorted) {
    if (previous && value - previous > 1) result.push(null)
    result.push(value)
    previous = value
  }
  return result
}

export { Pagination }
