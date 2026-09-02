import { jsonOk, parseJson, route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { deleteInvoice, getInvoiceOrThrow, updateInvoice } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'
import { updateInvoiceSchema } from '@/lib/validation/invoice'

type Context = RouteContext<{ id: string }>

async function invoiceId(context: Context): Promise<string> {
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')
  return id
}

export const GET = route(async (request, context: Context) => {
  const user = await requireUser()
  return jsonOk({ invoice: await getInvoiceOrThrow(user.id, await invoiceId(context)) })
})

/**
 * Drafts edit freely. A sent invoice needs `confirmSentEdit`, and a paid one
 * cannot be edited at all — both answered as 409 `invalid_invoice_state`, which
 * the UI turns into a confirmation dialog or an explanation (INV-12).
 */
export const PATCH = route(async (request, context: Context) => {
  const user = await requireUser()
  const id = await invoiceId(context)
  const input = await parseJson(request, updateInvoiceSchema)
  return jsonOk({ invoice: await updateInvoice(user.id, id, input) })
})

/** `?force=1` confirms deleting something already sent. Paid invoices archive. */
export const DELETE = route(async (request, context: Context) => {
  const user = await requireUser()
  const id = await invoiceId(context)
  const force = searchParamsToObject(request.url).force === '1'
  return jsonOk(await deleteInvoice(user.id, id, force))
})
