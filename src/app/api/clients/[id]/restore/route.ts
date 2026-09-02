import { jsonOk, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { restoreClient } from '@/lib/repositories/clients'
import { isValidUuid } from '@/lib/utils'

/** Brings an archived client back onto the active list and into the picker. */
export const POST = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That client could not be found.')
  return jsonOk({ client: await restoreClient(user.id, id) })
})
