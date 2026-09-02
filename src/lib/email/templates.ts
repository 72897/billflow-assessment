/**
 * Email bodies.
 *
 * Table-based HTML with inline styles, because that is what email clients
 * actually render, and a matching plain-text part for the ones that don't. Every
 * template ends in the same place: a button pointing at the public invoice page,
 * which is where the client can read the invoice and pay it without an account.
 */

import { formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/utils'
import { APP_NAME } from '@/lib/config'
import { escapeHtml } from './index'
import type { InvoiceDetail } from '@/types'

interface Shell {
  heading: string
  intro: string
  body: string
  ctaLabel: string
  ctaUrl: string
  footer: string
}

const BRAND = '#4f46e5'

function shell({ heading, intro, body, ctaLabel, ctaUrl, footer }: Shell): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
        <tr><td style="padding:28px 32px 8px">
          <h1 style="margin:0 0 6px;font-size:20px;line-height:28px;font-weight:600">${heading}</h1>
          <p style="margin:0;font-size:15px;line-height:24px;color:#475569">${intro}</p>
        </td></tr>
        <tr><td style="padding:20px 32px 4px">${body}</td></tr>
        <tr><td style="padding:12px 32px 28px">
          <a href="${ctaUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:8px">${ctaLabel}</a>
          <p style="margin:14px 0 0;font-size:13px;line-height:20px;color:#64748b">
            Or paste this link into your browser:<br>
            <a href="${ctaUrl}" style="color:${BRAND};word-break:break-all">${ctaUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;line-height:18px;color:#64748b">${footer}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">Sent with ${APP_NAME}</p>
    </td></tr>
  </table>
</body>
</html>`
}

/** The amount / due date / number block that appears in every template. */
function summaryTable(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#64748b">${escapeHtml(label)}</td>
          <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:500;text-align:right">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;padding:6px 16px">${cells}</table>`
}

function paragraphs(message: string): string {
  const clean = message.trim()
  if (!clean) return ''
  return clean
    .split(/\n{2,}/)
    .map(
      (part) =>
        `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#334155;white-space:pre-line">${escapeHtml(part)}</p>`,
    )
    .join('')
}

export interface InvoiceEmailInput {
  invoice: InvoiceDetail
  shareUrl: string
  message: string
  reminder?: boolean
}

export function invoiceEmail({ invoice, shareUrl, message, reminder = false }: InvoiceEmailInput): {
  html: string
  text: string
} {
  const amount = formatMoney(invoice.total, invoice.currency)
  const business = invoice.business.businessName || APP_NAME
  const overdue = invoice.displayStatus === 'overdue'

  const heading = reminder
    ? overdue
      ? `Payment overdue — invoice ${escapeHtml(invoice.invoiceNumber)}`
      : `A reminder about invoice ${escapeHtml(invoice.invoiceNumber)}`
    : `Invoice ${escapeHtml(invoice.invoiceNumber)} from ${escapeHtml(business)}`

  const intro = reminder
    ? `${escapeHtml(amount)} is ${overdue ? 'past due' : 'due'} on ${escapeHtml(formatDate(invoice.dueDate, 'long'))}.`
    : `${escapeHtml(business)} has sent you an invoice for ${escapeHtml(amount)}.`

  const body =
    paragraphs(message) +
    summaryTable([
      ['Invoice number', invoice.invoiceNumber],
      ['Issued', formatDate(invoice.issueDate, 'long')],
      ['Due', formatDate(invoice.dueDate, 'long')],
      ['Amount due', amount],
    ])

  const html = shell({
    heading,
    intro,
    body,
    ctaLabel: 'View and pay invoice',
    ctaUrl: shareUrl,
    footer: `This link opens the invoice — no account or password needed. Questions? Reply to this email to reach ${escapeHtml(
      invoice.business.businessEmail || business,
    )}.`,
  })

  const text = [
    heading.replace(/&amp;/g, '&'),
    '',
    message.trim(),
    '',
    `Invoice number: ${invoice.invoiceNumber}`,
    `Issued: ${formatDate(invoice.issueDate, 'long')}`,
    `Due: ${formatDate(invoice.dueDate, 'long')}`,
    `Amount due: ${amount}`,
    '',
    `View and pay: ${shareUrl}`,
    '',
    `— ${business}`,
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n')

  return { html, text }
}

export interface ReceiptEmailInput {
  invoiceNumber: string
  businessName: string
  clientName: string
  amount: number
  currency: string
  reference: string
  paidAt: string
  shareUrl: string
}

/** Sent to the payer the moment a simulated payment succeeds. */
export function receiptEmail(input: ReceiptEmailInput): { html: string; text: string } {
  const amount = formatMoney(input.amount, input.currency)
  const heading = `Payment received — ${escapeHtml(input.invoiceNumber)}`
  const intro = `Thank you, ${escapeHtml(input.clientName || 'there')}. ${escapeHtml(
    input.businessName || APP_NAME,
  )} has marked this invoice as paid.`

  const html = shell({
    heading,
    intro,
    body: summaryTable([
      ['Invoice number', input.invoiceNumber],
      ['Amount paid', amount],
      ['Reference', input.reference],
      ['Paid on', formatDate(input.paidAt, 'long')],
    ]),
    ctaLabel: 'View receipt',
    ctaUrl: `${input.shareUrl}?receipt=1`,
    footer: 'Keep this email as your record of payment. The receipt link stays available.',
  })

  const text = [
    `Payment received — ${input.invoiceNumber}`,
    '',
    `Amount paid: ${amount}`,
    `Reference: ${input.reference}`,
    `Paid on: ${formatDate(input.paidAt, 'long')}`,
    '',
    `Receipt: ${input.shareUrl}?receipt=1`,
    '',
    `— ${input.businessName || APP_NAME}`,
  ].join('\n')

  return { html, text }
}

/** Default subject / body the send dialog pre-fills, editable by the user. */
export function defaultSendSubject(invoiceNumber: string, businessName: string): string {
  return `Invoice ${invoiceNumber} from ${businessName || APP_NAME}`
}

export function defaultSendMessage(input: {
  clientName: string
  invoiceNumber: string
  amount: string
  dueDate: string
  businessName: string
  senderName: string
}): string {
  return `Hi ${input.clientName || 'there'},

Please find invoice ${input.invoiceNumber} for ${input.amount}, due ${formatDate(input.dueDate, 'long')}.

You can view and pay it using the link below.

Thanks,
${input.senderName || input.businessName}`
}

export function defaultReminderMessage(input: {
  clientName: string
  invoiceNumber: string
  amount: string
  dueDate: string
  daysOverdue: number
  senderName: string
}): string {
  const timing =
    input.daysOverdue > 0
      ? `is now ${input.daysOverdue} day${input.daysOverdue === 1 ? '' : 's'} past its due date of ${formatDate(input.dueDate, 'long')}`
      : `falls due on ${formatDate(input.dueDate, 'long')}`

  return `Hi ${input.clientName || 'there'},

A quick reminder that invoice ${input.invoiceNumber} for ${input.amount} ${timing}.

If it is already on its way, please ignore this note.

Thanks,
${input.senderName}`
}
