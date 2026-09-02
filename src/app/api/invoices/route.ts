import { jsonOk, parseJson, parseOrThrow, route, searchParamsToObject } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { createInvoice, listInvoices } from '@/lib/repositories/invoices'
import { createInvoiceSchema, invoiceListQuerySchema } from '@/lib/validation/invoice'

/**
 * The invoice list. Every filter — text search, status, client, date range, sort,
 * page — is applied in one SQL statement, because an account with two thousand
 * invoices should not ship two thousand rows to the browser to display ten.
 */
export const GET = route(async (request) => {
  const user = await requireUser()
  const params = parseOrThrow(invoiceListQuerySchema, searchParamsToObject(request.url))
  return jsonOk(await listInvoices(user.id, params))
})

/**
 * Totals are recalculated from the line items server-side; any amounts in the
 * payload are treated as input, never as truth (INV-18).
 */
export const POST = route(async (request) => {
  const user = await requireUser()
  const input = await parseJson(request, createInvoiceSchema)
  const invoice = await createInvoice(user.id, input)
  return jsonOk({ invoice }, { status: 201 })
})
