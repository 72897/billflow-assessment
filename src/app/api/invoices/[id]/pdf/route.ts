import { route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { invoiceDetailToPdfData, pdfFilename, pdfHeaders, renderInvoicePdf } from '@/lib/pdf/render'
import { getInvoiceOrThrow } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'

/**
 * The invoice as a PDF.
 *
 * Rendered on demand rather than stored: the file is a pure function of the
 * invoice, so there is no second copy to keep in sync and nothing to clean up
 * when a line item changes. `?download=1` switches the disposition — the same
 * bytes either preview in the browser's viewer or land in the downloads folder
 * (PDF-01).
 */
export const GET = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')

  const invoice = await getInvoiceOrThrow(user.id, id)
  const bytes = await renderInvoicePdf(invoiceDetailToPdfData(invoice))

  const { download } = searchParamsToObject(request.url)
  const filename = pdfFilename('invoice', invoice.invoiceNumber)

  return new Response(new Uint8Array(bytes), {
    headers: pdfHeaders(filename, bytes.byteLength, download === '1' || download === 'true'),
  })
})
