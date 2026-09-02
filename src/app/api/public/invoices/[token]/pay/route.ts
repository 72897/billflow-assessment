import { headers } from 'next/headers'
import { jsonOk, parseJson, route, type RouteContext } from '@/lib/api/respond'
import { publicInvoiceUrl } from '@/lib/config'
import { sendEmail } from '@/lib/email'
import { receiptEmail } from '@/lib/email/templates'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { payPublicInvoice } from '@/lib/repositories/public'
import { paymentSchema } from '@/lib/validation/invoice'

/**
 * Pays an invoice from the public link — the one write an anonymous caller can
 * make, so it is the most carefully fenced endpoint in the app.
 *
 * Three guards, all in place before anything is written: a per-token and per-IP
 * rate limit (nobody gets to grind this in a loop), the `expectedTotal` echo so a
 * client can only pay the amount they were actually shown, and the idempotency key
 * that turns a double-clicked Pay button into a single payment (PAY-03, PAY-05).
 *
 * The receipt email is deliberately best-effort. The money is recorded inside a
 * transaction that has already committed by the time we try to send; failing the
 * request because a mail provider hiccuped would tell the client their payment did
 * not go through when it did.
 */
export const POST = route(async (request, context: RouteContext<{ token: string }>) => {
  const { token } = await context.params

  const headerList = await headers()
  enforceRateLimit(
    { key: `pay:token:${token}`, limit: 10, windowSeconds: 600 },
    'Too many payment attempts for this invoice. Please wait a few minutes.',
  )
  enforceRateLimit(
    { key: `pay:ip:${clientIpFrom(headerList)}`, limit: 20, windowSeconds: 600 },
    'Too many payment attempts. Please wait a few minutes and try again.',
  )

  const input = await parseJson(request, paymentSchema)
  const result = await payPublicInvoice(token, {
    method: input.method,
    payerNote: input.payerNote,
    idempotencyKey: input.idempotencyKey,
    expectedTotal: input.expectedTotal,
  })

  const invoice = result.invoice
  let receiptSent = false

  if (!result.alreadyPaid && invoice.client.email && result.payment) {
    const { html, text } = receiptEmail({
      invoiceNumber: invoice.invoiceNumber,
      businessName: invoice.business.businessName,
      clientName: invoice.client.name,
      amount: result.payment.amount,
      currency: invoice.currency,
      reference: result.payment.reference,
      paidAt: result.payment.paidAt,
      shareUrl: publicInvoiceUrl(token),
    })

    receiptSent = await sendEmail({
      to: invoice.client.email,
      subject: `Receipt for invoice ${invoice.invoiceNumber}`,
      html,
      text,
      replyTo: invoice.business.businessEmail || undefined,
    })
      .then(() => true)
      .catch((error: unknown) => {
        console.error('[pay] receipt email failed:', error)
        return false
      })
  }

  return jsonOk({
    invoice,
    payment: result.payment,
    alreadyPaid: result.alreadyPaid,
    receiptSent,
  })
})
