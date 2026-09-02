import { jsonOk, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { archiveInvoice, getInvoiceOrThrow, restoreInvoice } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'

/**
 * Archive and un-archive.
 *
 * A paid invoice is a financial record, so "delete" archives it instead of
 * removing the row - the money stays in the books and the totals stay honest.
 * This endpoint is the deliberate version of that, plus the undo (INV-13).
 */
async function invoiceId(context: RouteContext<{ id: string }>): Promise<string> {
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')
  return id
}

export const POST = route(async (_request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const id = await invoiceId(context)

  await archiveInvoice(user.id, id)
  return jsonOk({ archived: true, invoice: await getInvoiceOrThrow(user.id, id) })
})

export const DELETE = route(async (_request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const id = await invoiceId(context)

  await restoreInvoice(user.id, id)
  return jsonOk({ archived: false, invoice: await getInvoiceOrThrow(user.id, id) })
})
