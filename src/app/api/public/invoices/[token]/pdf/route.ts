import { headers } from 'next/headers'
import { route, searchParamsToObject, type RouteContext } from '@/lib/api/respond'
import { pdfFilename, pdfHeaders, publicInvoiceToPdfData, renderInvoicePdf } from '@/lib/pdf/render'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { getPublicInvoiceOrThrow } from '@/lib/repositories/public'

/**
 * The client's copy of the PDF, from the share link.
 *
 * Byte-identical to the owner's download — same document, same adapter — so there
 * is never a "which version did you look at?" conversation. Rate-limited a little
 * tighter than the page itself, since each request rasterises a document.
 */
export const GET = route(async (request, context: RouteContext<{ token: string }>) => {
  const { token } = await context.params

  const headerList = await headers()
  enforceRateLimit({ key: `public-pdf:ip:${clientIpFrom(headerList)}`, limit: 60, windowSeconds: 600 })

  const invoice = await getPublicInvoiceOrThrow(token)
  const bytes = await renderInvoicePdf(publicInvoiceToPdfData(invoice))

  const { download } = searchParamsToObject(request.url)
  const filename = pdfFilename('invoice', invoice.invoiceNumber)

  return new Response(new Uint8Array(bytes), {
    headers: pdfHeaders(filename, bytes.byteLength, download === '1' || download === 'true'),
  })
})
