import { jsonOk, parseJson, route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import {
  assertNotDuplicateEmail,
  deleteClient,
  getClientOrThrow,
  updateClient,
} from '@/lib/repositories/clients'
import { listInvoicesForClient } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'
import { clientSchema } from '@/lib/validation/client'

type Context = RouteContext<{ id: string }>

/**
 * A malformed id is a 404 rather than a 422: `/clients/nope` is a wrong address,
 * not a failed form. Ownership is enforced inside every query, so another user's
 * id also reaches this same 404 and reveals nothing (CL-09).
 */
async function clientId(context: Context): Promise<string> {
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That client could not be found.')
  return id
}

export const GET = route(async (request, context: Context) => {
  const user = await requireUser()
  const id = await clientId(context)
  const client = await getClientOrThrow(user.id, id)
  const invoices = await listInvoicesForClient(user.id, id)
  return jsonOk({ client, invoices })
})

export const PATCH = route(async (request, context: Context) => {
  const user = await requireUser()
  const id = await clientId(context)
  const input = await parseJson(request, clientSchema)
  const client = await updateClient(user.id, id, input).catch(assertNotDuplicateEmail)
  return jsonOk({ client })
})

/**
 * `?force=1` is the confirmation step: without it a client that has invoices
 * answers 409 with an explanation, so the UI can offer "archive instead"
 * rather than silently destroying billing history (CL-08).
 */
export const DELETE = route(async (request, context: Context) => {
  const user = await requireUser()
  const id = await clientId(context)
  const force = searchParamsToObject(request.url).force === '1'
  return jsonOk(await deleteClient(user.id, id, force))
})
