import { jsonOk, parseJson, parseOrThrow, route, searchParamsToObject } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { assertNotDuplicateEmail, createClient, listClients } from '@/lib/repositories/clients'
import { clientListQuerySchema, clientSchema } from '@/lib/validation/client'

/** Search, sort and pagination all happen in SQL — see `listClients`. */
export const GET = route(async (request) => {
  const user = await requireUser()
  const params = parseOrThrow(clientListQuerySchema, searchParamsToObject(request.url))
  return jsonOk(await listClients(user.id, params))
})

export const POST = route(async (request) => {
  const user = await requireUser()
  const input = await parseJson(request, clientSchema)
  const client = await createClient(user.id, input).catch(assertNotDuplicateEmail)
  return jsonOk({ client }, { status: 201 })
})
