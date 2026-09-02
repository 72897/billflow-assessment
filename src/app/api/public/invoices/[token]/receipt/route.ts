import { headers } from 'next/headers'
import { route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { InvoiceStateError } from '@/lib/errors'
import { pdfFilename, pdfHeaders, publicInvoiceToPdfData, renderReceiptPdf } from '@/lib/pdf/render'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { getPublicInvoiceOrThrow } from '@/lib/repositories/public'

/**
 * The receipt a client can download straight after paying, without an account -
 * the last step of the payment flow, and the thing they will forward to whoever
 * does their bookkeeping (PAY-06).
 */
export const GET = route(async (request, context: RouteContext<{ token: string }>) => {
  const { token } = await context.params

  const headerList = await headers()
  enforceRateLimit({ key: `public-pdf:ip:${clientIpFrom(headerList)}`, limit: 60, windowSeconds: 600 })

  const invoice = await getPublicInvoiceOrThrow(token)
  if (!invoice.payment) {
    throw new InvoiceStateError('There is no receipt for this invoice yet.', { status: invoice.displayStatus })
  }

  const bytes = await renderReceiptPdf(publicInvoiceToPdfData(invoice))

  const { download } = searchParamsToObject(request.url)
  const filename = pdfFilename('receipt', invoice.invoiceNumber)

  return new Response(new Uint8Array(bytes), {
    headers: pdfHeaders(filename, bytes.byteLength, download === '1' || download === 'true'),
  })
})
