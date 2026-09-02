'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'

export interface StatusTab {
  value: string
  label: string
  count: number
}

export interface StatusTabsProps {
  /** The query-string key these tabs own. */
  param?: string
  tabs: readonly StatusTab[]
  /** The value that means "no filter" — removed from the URL rather than written. */
  neutralValue?: string
  label?: string
  className?: string
}

/**
 * Status filter as a row of tabs with counts, rather than a dropdown.
 *
 * The five statuses are the primary way an invoice list gets narrowed, and a tab
 * strip shows all five at once with how many are in each — a dropdown hides both.
 * The counts come from the server under the same search and client filters as the
 * rows, so a tab reading "3" opens onto exactly three invoices.
 *
 * Overflows to a horizontal scroller on a phone instead of wrapping to two lines,
 * because a wrapped tab strip stops reading as one control.
 */
function StatusTabs({ param = 'status', tabs, neutralValue = 'all', label = 'Filter by status', className }: StatusTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = searchParams.get(param) ?? neutralValue
  const active = tabs.some((tab) => tab.value === current) ? current : neutralValue

  function select(next: string) {
    if (next === active) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === neutralValue) params.delete(param)
    else params.set(param, next)
    // Page 4 of "all" is not page 4 of "overdue".
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-none', pending && 'opacity-70', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.value === active
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => select(tab.value)}
            className={cn(
              'flex shrink-0 select-none items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              selected
                ? 'bg-foreground text-background shadow-xs'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-muted',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'tabular rounded px-1 text-2xs font-semibold transition-colors duration-150',
                selected ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
              )}
            >
              {tab.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export { StatusTabs }
