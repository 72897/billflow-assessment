import { jsonOk, parseJson, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { getInvoiceOrThrow, recordPayment } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'
import { recordPaymentSchema } from '@/lib/validation/invoice'

/**
 * "Mark as paid" — the owner recording money that arrived out of band (a bank
 * transfer, cash, a card machine). Shares the settlement path with the public
 * payment page, so both write a `payments` row and flip the invoice inside one
 * transaction, and both are idempotent (PAY-04).
 */
export const POST = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')

  const input = await parseJson(request, recordPaymentSchema)
  const result = await recordPayment(user.id, id, {
    method: input.method,
    payerNote: input.note,
    idempotencyKey: input.idempotencyKey ?? null,
  })

  return jsonOk({
    invoice: await getInvoiceOrThrow(user.id, id),
    payment: result.payment,
    alreadyPaid: result.alreadyPaid,
  })
})
