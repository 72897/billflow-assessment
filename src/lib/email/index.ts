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
 * The outbox is also the answer when the provider refuses a message for a reason
 * that will never change — a Resend account still in test mode may only write to
 * the address that owns it, and an unverified sending domain is rejected the same
 * way every time. Failing those sends would strand the user: the retry button
 * sends the identical message to the identical refusal. So a permanent rejection
 * degrades to the outbox and reports itself, while a rate limit or a provider
 * outage still fails loudly, because there retrying is exactly right.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
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
  /** Why this went to the outbox, when it was not simply a missing API key. */
  note?: string
}

/**
 * A rejection that retrying cannot fix — a policy or configuration answer from
 * the provider rather than a bad moment.
 */
export class PermanentEmailRejection extends Error {
  readonly name = 'PermanentEmailRejection'
}

/** Rejections that are worth retrying, so they must not become an outbox write. */
const TRANSIENT = /rate.?limit|too many|timed? ?out|temporar|unavailable|internal (server )?error|try again/i

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
 *
 * The project directory is tried first because that is where a developer will
 * look for it. On a serverless host the bundle directory is read-only, so the
 * temp directory is tried next, and if even that is refused the envelope is
 * logged and the send still reports as an outbox delivery — the invoice has been
 * marked sent and the share link works, and the caller already tells the user
 * that no real email went out.
 */
async function sendViaOutbox(message: EmailMessage, note?: string): Promise<EmailResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `${stamp}-${slug(message.subject) || 'message'}.html`
  const reason = note ?? 'RESEND_API_KEY is not set, so nothing was delivered.'

  const envelope = `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(message.subject)}</title>
<div style="font:13px ui-monospace,Menlo,monospace;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:16px 20px;color:#334155">
  <div><strong>From:</strong> ${escapeHtml(emailFrom())}</div>
  <div><strong>To:</strong> ${escapeHtml(message.to)}</div>
  <div><strong>Subject:</strong> ${escapeHtml(message.subject)}</div>
  <div><strong>Date:</strong> ${new Date().toUTCString()}</div>
  <div style="margin-top:8px;color:#64748b">Captured by the BillFlow outbox transport — ${escapeHtml(reason)}</div>
</div>
${message.html}`

  console.log(`[email] outbox → ${message.to} — "${message.subject}"`)

  for (const dir of [path.join(process.cwd(), OUTBOX_DIR), path.join(os.tmpdir(), 'billflow-mail')]) {
    try {
      const file = path.join(dir, name)
      await mkdir(dir, { recursive: true })
      await writeFile(file, envelope, 'utf8')
      console.log(`[email] written to ${file}`)
      return { transport: 'outbox', id: `outbox_${stamp}`, file, note }
    } catch {
      // Read-only filesystem — try the next location.
    }
  }

  console.log('[email] nowhere writable; envelope not persisted')
  return { transport: 'outbox', id: `outbox_${stamp}`, note }
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
    // Resend answers a policy or configuration problem with an `error` object
    // rather than by throwing, and those answers do not change on a retry.
    const detail = `Resend rejected the message: ${error.message}`
    throw TRANSIENT.test(error.message) ? new Error(detail) : new PermanentEmailRejection(detail)
  }
  return { transport: 'resend', id: data?.id ?? 'unknown' }
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!hasEmailProvider()) return sendViaOutbox(message)

  try {
    return await sendViaResend(message)
  } catch (error) {
    if (!(error instanceof PermanentEmailRejection)) throw error

    // Nothing the user can do from here, and nothing a retry would change — so
    // capture the message and let the caller carry on, saying plainly that the
    // email did not leave.
    console.warn(`[email] ${error.message} — falling back to the outbox`)
    return sendViaOutbox(message, error.message)
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
