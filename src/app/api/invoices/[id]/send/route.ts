import { headers } from 'next/headers'
import { jsonOk, parseJson, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { publicInvoiceUrl } from '@/lib/config'
import { AppError, InvoiceStateError, NotFoundError } from '@/lib/errors'
import { sendEmail } from '@/lib/email'
import { invoiceEmail } from '@/lib/email/templates'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { getInvoiceOrThrow, markInvoiceSent, setPublicLink } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'
import { sendInvoiceSchema } from '@/lib/validation/invoice'

/**
 * Sends an invoice by email.
 *
 * The order of operations is the point: the share link is minted and the message
 * is delivered *before* the invoice is marked sent. If the provider fails in a way
 * a retry could fix, the invoice stays a draft and the user is told - rather than
 * seeing a "Sent" badge for an email that never left.
 *
 * A permanent rejection (a test-mode Resend account, an unverified sending
 * domain) is handled inside `sendEmail`, which captures the message to the outbox
 * and says so. The invoice is marked sent in that case, because the share link it
 * minted is live and payable - and `delivery.note` carries the reason to the UI so
 * nobody is told an email arrived when it did not.
 */
export const POST = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')

  const headerList = await headers()
  enforceRateLimit(
    { key: `send:user:${user.id}`, limit: 40, windowSeconds: 3600 },
    'You have sent a lot of invoices in the last hour. Please wait a few minutes.',
  )
  enforceRateLimit(
    { key: `send:invoice:${id}`, limit: 6, windowSeconds: 600 },
    'This invoice has just been sent several times. Please wait a few minutes before sending it again.',
  )
  enforceRateLimit({ key: `send:ip:${clientIpFrom(headerList)}`, limit: 60, windowSeconds: 3600 })

  const input = await parseJson(request, sendInvoiceSchema)
  const invoice = await getInvoiceOrThrow(user.id, id)

  if (invoice.status === 'paid') {
    throw new InvoiceStateError('This invoice is already paid, so there is nothing to send.', { status: 'paid' })
  }
  if (invoice.items.length === 0) {
    throw new InvoiceStateError('Add at least one line item before sending this invoice.', { status: invoice.status })
  }

  const { token } = await setPublicLink(user.id, id, 'create')
  const shareUrl = publicInvoiceUrl(token!)
  const { html, text } = invoiceEmail({ invoice, shareUrl, message: input.message })

  const delivery = await sendEmail({
    to: input.to,
    subject: input.subject,
    html,
    text,
    replyTo: invoice.business.businessEmail || undefined,
  }).catch((error: unknown) => {
    // Only a retryable failure reaches here - `sendEmail` absorbs the permanent
    // ones. So the advice is "try again", and the state is left exactly as it
    // was found, which for a first send means still a draft.
    const unchanged =
      invoice.status === 'draft'
        ? 'Your invoice is still a draft'
        : `${invoice.invoiceNumber} is unchanged`
    throw new AppError(
      `That email could not be sent. ${unchanged} - you can retry, or copy the link below and send it yourself.`,
      {
        status: 502,
        code: 'email_failed',
        details: { shareUrl },
        cause: error,
      },
    )
  })

  const outcome = await markInvoiceSent(user.id, id, { to: input.to, subject: input.subject, via: 'email' })

  return jsonOk({
    invoice: await getInvoiceOrThrow(user.id, id),
    shareUrl,
    firstSend: outcome.firstSend,
    delivery: { transport: delivery.transport, file: delivery.file ?? null, note: delivery.note ?? null },
  })
})
