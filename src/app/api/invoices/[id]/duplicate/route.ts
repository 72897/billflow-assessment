import { jsonOk, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { duplicateInvoice } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'

/**
 * "Duplicate" is how a freelancer bills a retainer every month: same client,
 * same lines, a fresh number and today's dates, back in draft.
 */
export const POST = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')
  return jsonOk({ invoice: await duplicateInvoice(user.id, id) }, { status: 201 })
})
