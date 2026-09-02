/**
 * Outgoing email.
 *
 * Two transports behind one function:
 *
 *   - `resend` when RESEND_API_KEY is set — real delivery.
 *   - `outbox` otherwise — the message is written to ./.mail/<timestamp>.html
 *     and its subject logged. Nothing is silently dropped, so the send and
 *     reminder flows are fully demonstrable on a machine with no email account,
 *     and a reviewer can open the file to see exactly what the client would get.
 *
 * A failed send is reported, never swallowed: the caller decides whether that
 * should fail the request (it does for "send invoice", because the user is
 * waiting to hear that their client got it).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { emailFrom, hasEmailProvider } from '@/lib/config'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface EmailResult {
  transport: 'resend' | 'outbox'
  id: string
  /** Where an outbox message landed, so the UI can tell the user. */
  file?: string
}

const OUTBOX_DIR = '.mail'

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/**
 * Writes the message to disk as a standalone HTML file with the envelope shown
 * at the top, so opening it answers "who was this sent to?" as well as "what did
 * it look like?".
 */
async function sendViaOutbox(message: EmailMessage): Promise<EmailResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(process.cwd(), OUTBOX_DIR, `${stamp}-${slug(message.subject) || 'message'}.html`)

  const envelope = `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(message.subject)}</title>
<div style="font:13px ui-monospace,Menlo,monospace;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:16px 20px;color:#334155">
  <div><strong>From:</strong> ${escapeHtml(emailFrom())}</div>
  <div><strong>To:</strong> ${escapeHtml(message.to)}</div>
  <div><strong>Subject:</strong> ${escapeHtml(message.subject)}</div>
  <div><strong>Date:</strong> ${new Date().toUTCString()}</div>
  <div style="margin-top:8px;color:#64748b">Captured by the BillFlow outbox transport — RESEND_API_KEY is not set, so nothing was delivered.</div>
</div>
${message.html}`

  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, envelope, 'utf8')

  console.log(`[email] outbox → ${message.to} — "${message.subject}"`)
  console.log(`[email] written to ${file}`)

  return { transport: 'outbox', id: `outbox_${stamp}`, file }
}

async function sendViaResend(message: EmailMessage): Promise<EmailResult> {
  const { Resend } = await import('resend')
  const client = new Resend(process.env.RESEND_API_KEY!.trim())

  const { data, error } = await client.emails.send({
    from: emailFrom(),
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
  })

  if (error) {
    throw new Error(`Resend rejected the message: ${error.message}`)
  }
  return { transport: 'resend', id: data?.id ?? 'unknown' }
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!hasEmailProvider()) return sendViaOutbox(message)
  return sendViaResend(message)
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
