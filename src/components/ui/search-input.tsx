'use client'

import { Loader2, Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { inputBase } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface SearchInputProps {
  /** The query-string key this box owns. */
  param?: string
  placeholder?: string
  /** Screen-reader label; the box has no visible one. */
  label?: string
  className?: string
}

const DEBOUNCE_MS = 300

/**
 * A search box that lives in the URL.
 *
 * Filtering happens on the server, so the term has to reach it - and putting it
 * in the query string rather than component state means a search is shareable,
 * survives a refresh, and comes back if the user hits Back. It is also what
 * keeps the term in the box on a no-results screen (CL-04): the input reads its
 * value from the URL, so there is no second copy to lose.
 *
 * Typing is debounced and pushed with `replace`, so a five-letter search leaves
 * one history entry instead of five, and `useTransition` keeps the old rows on
 * screen - dimmed with a spinner - while the server re-queries.
 */
function SearchInput({ param = 'q', placeholder = 'Search', label = 'Search', className }: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlValue = searchParams.get(param) ?? ''

  const [value, setValue] = useState(urlValue)
  const [pending, startTransition] = useTransition()

  // The last value this component put into the URL. Anything else arriving in
  // `urlValue` came from outside - a cleared filter chip, the back button - and
  // the box should follow it rather than fight it.
  const pushed = useRef(urlValue)

  useEffect(() => {
    if (urlValue !== pushed.current) {
      pushed.current = urlValue
      setValue(urlValue)
    }
  }, [urlValue])

  useEffect(() => {
    if (value === pushed.current) return
    const timer = setTimeout(() => {
      pushed.current = value
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(param, value)
      else params.delete(param)
      // A new search invalidates the page number: page 3 of the old result set
      // is very often empty in the new one.
      params.delete('page')
      const query = params.toString()
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, param, pathname, router, searchParams])

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <Search className="size-4" aria-hidden />
      </span>
      <input
        type="search"
        role="searchbox"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={cn(inputBase, 'pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none')}
      />
      {pending ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="sr-only">Searching</span>
        </span>
      ) : value ? (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

export { SearchInput }
