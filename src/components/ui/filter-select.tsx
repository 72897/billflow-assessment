'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface FilterSelectOption {
  value: string
  label: string
}

export interface FilterSelectProps {
  /** The query-string key this control owns. */
  param: string
  options: readonly FilterSelectOption[]
  /** The value that means "no filter"; it is removed from the URL rather than written. */
  neutralValue?: string
  /** Prefix shown in the trigger — "Status", "Sort by". */
  label: string
  /** Hides the prefix on narrow screens, where there is no room for it. */
  compact?: boolean
  className?: string
}

/**
 * A dropdown filter that writes to the URL.
 *
 * Same reasoning as `SearchInput`: the server does the filtering, so the choice
 * has to be in the query string. Changing a filter also drops `page`, because
 * page 4 of "all invoices" is not page 4 of "overdue only".
 *
 * The neutral option is deleted from the URL instead of being written as
 * `status=all`, which keeps a default view's address clean — `/invoices` rather
 * than `/invoices?status=all&sort=newest`.
 */
function FilterSelect({ param, options, neutralValue, label, compact, className }: FilterSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const fallback = neutralValue ?? options[0]?.value ?? ''
  const current = searchParams.get(param) ?? fallback
  const selected = options.some((option) => option.value === current) ? current : fallback

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === fallback) params.delete(param)
    else params.set(param, next)
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  return (
    <Select value={selected} onValueChange={change}>
      <SelectTrigger
        aria-label={label}
        className={cn('w-full gap-1.5 sm:w-auto', pending && 'opacity-70', className)}
      >
        <span className={cn('shrink-0 text-muted-foreground', compact && 'hidden lg:inline')}>{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[11rem]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { FilterSelect }
