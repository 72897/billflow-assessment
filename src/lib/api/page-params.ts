/**
 * Query-string handling for server-rendered pages.
 *
 * A list screen's filters live in the URL, which means they are typed by hand,
 * bookmarked, and occasionally mangled. A page must not answer a 500 to
 * `?page=banana`, so parsing here is forgiving in a way `parseOrThrow` (for API
 * requests, where a bad query is a client bug worth reporting) deliberately is
 * not.
 */

import type { z } from 'zod'

/** What Next hands a page for `searchParams`, once awaited. */
export type RawSearchParams = Record<string, string | string[] | undefined>

/**
 * Collapses `?status=paid&status=draft` to the first value and drops empties.
 *
 * The query schemas expect one string per key; without this, a repeated
 * parameter arrives as an array, fails validation and silently discards every
 * other filter with it.
 */
export function firstValues(raw: RawSearchParams): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value
    if (typeof single === 'string' && single !== '') result[key] = single
  }
  return result
}

/**
 * Parses a page's `searchParams`, falling back to the schema's own defaults when
 * the URL cannot be made sense of - the user sees an unfiltered list rather than
 * an error page, which is the more useful answer to a broken link.
 */
export function parseQuery<S extends z.ZodTypeAny>(schema: S, raw: RawSearchParams): z.infer<S> {
  const result = schema.safeParse(firstValues(raw))
  return result.success ? result.data : (schema.parse({}) as z.infer<S>)
}
