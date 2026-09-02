import { jsonOk, route } from '@/lib/api/respond'
import { destroyCurrentSession } from '@/lib/auth'

/**
 * Signing out deletes the session row, not just the cookie, so a token captured
 * earlier stops working immediately (AUTH-07). POST rather than GET: a link
 * prefetch must not be able to sign someone out.
 */
export const POST = route(async () => {
  await destroyCurrentSession()
  return jsonOk({ signedOut: true })
})
