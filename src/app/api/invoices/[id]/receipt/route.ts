import { route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { InvoiceStateError, NotFoundError } from '@/lib/errors'
import { invoiceDetailToPdfData, pdfFilename, pdfHeaders, renderReceiptPdf } from '@/lib/pdf/render'
import { getInvoiceOrThrow } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'

/**
 * The payment receipt.
 *
 * Only exists once money has been recorded — asking for a receipt for an unpaid
 * invoice is a state error, not an empty document, so the UI can say why rather
 * than handing over a PDF with blanks in it.
 */
export const GET = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')

  const invoice = await getInvoiceOrThrow(user.id, id)
  if (invoice.status !== 'paid') {
    throw new InvoiceStateError('There is no receipt yet — this invoice has not been paid.', {
      status: invoice.status,
    })
  }

  const bytes = await renderReceiptPdf(invoiceDetailToPdfData(invoice))

  const { download } = searchParamsToObject(request.url)
  const filename = pdfFilename('receipt', invoice.invoiceNumber)

  return new Response(new Uint8Array(bytes), {
    headers: pdfHeaders(filename, bytes.byteLength, download === '1' || download === 'true'),
  })
})
