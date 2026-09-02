'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface SortHeadProps {
  /** The `sort` value that orders this column ascending. */
  asc: string
  /** The `sort` value that orders it descending. */
  desc: string
  /** Where an unsorted column jumps on its first click. Amounts want the big
   *  numbers first; dates and numbers read better ascending. */
  first?: 'asc' | 'desc'
  /** The sort the server falls back to when the URL carries none. */
  fallback?: string
  param?: string
  /** Right-aligns the label, for the money column. */
  align?: 'left' | 'right'
  className?: string
  children: React.ReactNode
}

/**
 * A column header that sorts.
 *
 * The eight sort orders already exist as server-side query values, so this adds
 * no new API surface: clicking a header rewrites one search param and the same
 * SQL that the sort dropdown drives does the work. Sorting stays in the URL,
 * which is what lets "largest unpaid invoice first" be a link someone can send.
 *
 * `aria-sort` goes on the cell rather than the button, because that is where a
 * screen reader looks for it, and the arrow only appears on the active column -
 * an inactive one shows a faint pair of chevrons on hover, so the whole header
 * row does not turn into a wall of arrows.
 */
function SortHead({
  asc,
  desc,
  first = 'asc',
  fallback,
  param = 'sort',
  align = 'left',
  className,
  children,
}: SortHeadProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = searchParams.get(param) ?? fallback
  const direction = current === asc ? 'asc' : current === desc ? 'desc' : null
  const next = direction === null ? (first === 'asc' ? asc : desc) : direction === 'asc' ? desc : asc

  function applySort() {
    const params = new URLSearchParams(searchParams.toString())
    params.set(param, next)
    // Re-sorting invalidates the page number the same way a new search does.
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown

  return (
    <TableHead
      className={cn('p-0', className)}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={applySort}
        aria-busy={pending || undefined}
        className={cn(
          'group/sort flex h-10 w-full items-center gap-1.5 px-4 text-2xs font-semibold uppercase tracking-wide transition-colors duration-150',
          align === 'right' && 'justify-end',
          direction ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {children}
        <Icon
          className={cn(
            'size-3 shrink-0 transition-opacity duration-150',
            direction ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60',
          )}
          aria-hidden
        />
      </button>
    </TableHead>
  )
}

export { SortHead }
