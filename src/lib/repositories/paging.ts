/**
 * Pagination totals.
 *
 * Lists carry their own row count with `count(*) OVER ()`, which costs nothing
 * extra because the window rides along with the page being fetched. The one hole
 * is an empty page: a window function needs a row to sit on, so a request for
 * page 4 of a list that now holds three rows would report a total of zero and
 * the pager would tell the user there is nothing here at all.
 *
 * That happens for real — someone bookmarks page 4, then deletes invoices, or a
 * filter narrows the list while they are two pages deep. So when a page past the
 * first comes back empty, one extra `count(*)` establishes the real total and
 * the UI can send them to a page that exists.
 */

import { query } from '@/lib/db'
import { int } from './mappers'

export async function totalFor(
  from: string,
  where: string[],
  values: unknown[],
  rows: Array<Record<string, unknown>>,
  page: number,
): Promise<number> {
  if (rows.length > 0) return int(rows[0]!.total_rows)
  if (page <= 1) return 0

  const counted = await query<{ total: number }>(
    `SELECT count(*)::int AS total ${from} WHERE ${where.join(' AND ')}`,
    values,
  )
  return int(counted.rows[0]?.total)
}
