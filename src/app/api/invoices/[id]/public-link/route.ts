import { jsonOk, parseJson, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { publicInvoiceUrl } from '@/lib/config'
import { NotFoundError } from '@/lib/errors'
import { setPublicLink } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'
import { publicLinkActionSchema } from '@/lib/validation/invoice'

/**
 * Creates, revokes or rotates the share link.
 *
 * The token *is* the credential, so revoking simply sets it to NULL and the URL
 * 404s on the next request — there is no session to expire and nothing else to
 * clean up. Regenerating issues a new token, which invalidates any link the user
 * has already pasted somewhere they regret (SHR-04).
 */
export const POST = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')

  const { action } = await parseJson(request, publicLinkActionSchema)
  const { token } = await setPublicLink(user.id, id, action)

  return jsonOk({
    action,
    token,
    shareUrl: token ? publicInvoiceUrl(token) : null,
  })
})
