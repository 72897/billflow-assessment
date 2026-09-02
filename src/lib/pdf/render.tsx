/**
 * Turns a domain invoice into a PDF byte buffer.
 *
 * The adapters here are the only place that knows how `InvoiceDetail` (owner
 * view) and `PublicInvoice` (visitor view) differ. Both collapse to the same
 * `InvoicePdfData`, so one document definition serves the owner's download, the
 * emailed copy and the public page - a client and a freelancer looking at "the
 * invoice" are always looking at the same file.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePdf, ReceiptPdf, type InvoicePdfData } from './document'
import type { InvoiceDetail, Payment, PublicInvoice } from '@/types'

/** The payment a receipt should describe: the newest one that actually settled. */
function settledPayment(payments: Payment[]): Payment | null {
  const succeeded = payments.filter((payment) => payment.status === 'succeeded')
  if (succeeded.length === 0) return null
  return succeeded.reduce((latest, payment) => (payment.paidAt > latest.paidAt ? payment : latest))
}

export function invoiceDetailToPdfData(invoice: InvoiceDetail): InvoicePdfData {
  const payment = settledPayment(invoice.payments)

  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    displayStatus: invoice.displayStatus,
    currency: invoice.currency,
    items: invoice.items,
    subtotal: invoice.subtotal,
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    discountAmount: invoice.discountAmount,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    notes: invoice.notes,
    business: invoice.business,
    client: {
      name: invoice.client.name,
      company: invoice.client.company,
      email: invoice.client.email,
      address: invoice.client.address,
      phone: invoice.client.phone,
    },
    payment: payment
      ? {
          reference: payment.reference,
          amount: payment.amount,
          method: payment.method,
          cardLast4: payment.cardLast4,
          paidAt: payment.paidAt,
        }
      : null,
  }
}

export function publicInvoiceToPdfData(invoice: PublicInvoice): InvoicePdfData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    displayStatus: invoice.displayStatus,
    currency: invoice.currency,
    items: invoice.items,
    subtotal: invoice.subtotal,
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    discountAmount: invoice.discountAmount,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    notes: invoice.notes,
    business: invoice.business,
    client: invoice.client,
    payment: invoice.payment,
  }
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf data={data} />)
}

export async function renderReceiptPdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptPdf data={data} />)
}

/**
 * A filename a human can find again in their downloads folder. Anything that
 * would need quoting in a `Content-Disposition` header is replaced rather than
 * escaped, so the header stays simple.
 */
export function pdfFilename(kind: 'invoice' | 'receipt', invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
  return `${kind === 'receipt' ? 'Receipt' : 'Invoice'}-${safe}.pdf`
}

/** Headers shared by every PDF response: inline preview, but a sensible save name. */
export function pdfHeaders(filename: string, bytes: number, download: boolean): Headers {
  const headers = new Headers()
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Length', String(bytes))
  headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`)
  headers.set('Cache-Control', 'private, no-store')
  return headers
}
