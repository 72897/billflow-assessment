import { jsonOk, parseJson, route, type RouteContext } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { publicInvoiceUrl } from '@/lib/config'
import { sendEmail } from '@/lib/email'
import { invoiceEmail } from '@/lib/email/templates'
import { AppError, InvoiceStateError, NotFoundError, ValidationError } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { getInvoiceOrThrow, recordReminder, setPublicLink } from '@/lib/repositories/invoices'
import { isValidUuid } from '@/lib/utils'
import { remindInvoiceSchema } from '@/lib/validation/invoice'

/**
 * Chases an unpaid invoice.
 *
 * Same ordering as sending: deliver first, then record the reminder, so the
 * "Reminded 2 times" count on the invoice only ever reflects mail that actually
 * went out. Held to a tighter limit than sending — a reminder loop pointed at a
 * client's inbox is the one thing this endpoint must not enable.
 */
export const POST = route(async (request, context: RouteContext<{ id: string }>) => {
  const user = await requireUser()
  const { id } = await context.params
  if (!isValidUuid(id)) throw new NotFoundError('That invoice could not be found.')

  enforceRateLimit(
    { key: `remind:invoice:${id}`, limit: 3, windowSeconds: 3600 },
    'You have already sent a few reminders for this invoice in the last hour. Give your client a little time.',
  )
  enforceRateLimit(
    { key: `remind:user:${user.id}`, limit: 30, windowSeconds: 3600 },
    'That is a lot of reminders in one hour. Please wait a few minutes.',
  )

  const input = await parseJson(request, remindInvoiceSchema)
  const invoice = await getInvoiceOrThrow(user.id, id)

  if (invoice.status === 'draft') {
    throw new InvoiceStateError('Send this invoice before reminding your client about it.', { status: 'draft' })
  }
  if (invoice.status === 'paid') {
    throw new InvoiceStateError('This invoice is already paid — no reminder needed.', { status: 'paid' })
  }
  if (!invoice.client.email) {
    throw new ValidationError('This client has no email address. Add one, or share the payment link instead.', {
      email: ['Add an email address for this client'],
    })
  }

  const { token } = await setPublicLink(user.id, id, 'create')
  const shareUrl = publicInvoiceUrl(token!)
  const { html, text } = invoiceEmail({ invoice, shareUrl, message: input.message, reminder: true })

  const subject =
    invoice.displayStatus === 'overdue'
      ? `Overdue: invoice ${invoice.invoiceNumber}`
      : `Reminder: invoice ${invoice.invoiceNumber}`

  const delivery = await sendEmail({
    to: invoice.client.email,
    subject,
    html,
    text,
    replyTo: invoice.business.businessEmail || undefined,
  }).catch((error: unknown) => {
    throw new AppError('That reminder could not be sent. Please try again.', {
      status: 502,
      code: 'email_failed',
      details: { shareUrl },
      cause: error,
    })
  })

  const outcome = await recordReminder(user.id, id)

  return jsonOk({
    invoice: await getInvoiceOrThrow(user.id, id),
    shareUrl,
    reminderCount: outcome.reminderCount,
    sentTo: invoice.client.email,
    delivery: { transport: delivery.transport, file: delivery.file ?? null, note: delivery.note ?? null },
  })
})
