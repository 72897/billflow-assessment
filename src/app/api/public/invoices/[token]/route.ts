import { headers } from 'next/headers'
import { jsonOk, route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { getPublicInvoiceOrThrow, recordPublicView } from '@/lib/repositories/public'

/**
 * The invoice as an unauthenticated visitor sees it.
 *
 * No session, so the token is the whole credential and the projection is narrow
 * by construction - no ids, no user, no internal timeline. `?track=0` lets the
 * page refetch after paying without logging a second view.
 */
export const GET = route(async (request, context: RouteContext<{ token: string }>) => {
  const { token } = await context.params

  const headerList = await headers()
  enforceRateLimit({ key: `public:ip:${clientIpFrom(headerList)}`, limit: 240, windowSeconds: 600 })

  const invoice = await getPublicInvoiceOrThrow(token)

  const { track } = searchParamsToObject(request.url)
  if (track !== '0' && track !== 'false') {
    await recordPublicView(token)
  }

  return jsonOk({ invoice })
})
