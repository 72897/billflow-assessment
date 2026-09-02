/**
 * Outgoing email.
 *
 * Three transports behind one function, picked in this order:
 *
 *   - `smtp` when SMTP_USER / SMTP_PASSWORD (or EMAIL / EMAIL_PASSWORD) are set.
 *     A plain mailbox can write to any recipient, so this is the one that makes
 *     "send this invoice to my client" work for real.
 *   - `resend` when only RESEND_API_KEY is set — fine for transactional mail once
 *     a sending domain is verified, but an unverified account may only write to
 *     the address that owns it.
 *   - `outbox` when neither is configured — the message is written to
 *     ./.mail/<timestamp>.html and its subject logged. Nothing is silently
 *     dropped, so the send and reminder flows are fully demonstrable on a machine
 *     with no email account, and a reviewer can open the file to see exactly what
 *     the client would get.
 *
 * The outbox is also the answer when the provider refuses a message for a reason
 * that will never change — a wrong app password, an unverified sending domain, a
 * Resend account still in test mode. Failing those sends would strand the user:
 * the retry button sends the identical message to the identical refusal. So a
 * permanent rejection degrades to the outbox and reports itself, while a socket
 * error, a timeout or a rate limit still fails loudly, because there retrying is
 * exactly right.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { emailFrom, hasEmailProvider, smtpConfig, type SmtpConfig } from '@/lib/config'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface EmailResult {
  transport: 'smtp' | 'resend' | 'outbox'
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

/**
 * SMTP, via nodemailer.
 *
 * A plain mailbox reaches any recipient, which a Resend account without a
 * verified domain cannot — so this is the transport that makes "send this invoice
 * to my client" work for real. With Gmail the password must be an app password
 * (Google account → Security → App passwords); the account password is refused.
 *
 * The connection is not pooled. A send is rare and interactive, and on a
 * serverless host a pooled socket would be torn down between invocations anyway.
 */
async function sendViaSmtp(config: SmtpConfig, message: EmailMessage): Promise<EmailResult> {
  const nodemailer = await import('nodemailer')

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  })

  try {
    const info = await transporter.sendMail({
      from: emailFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    })

    console.log(`[email] smtp → ${message.to} — "${message.subject}" (${info.messageId})`)
    return { transport: 'smtp', id: info.messageId || 'unknown' }
  } catch (error) {
    throw classifySmtpError(error, config)
  } finally {
    transporter.close()
  }
}

/**
 * A wrong app password or a refused recipient will be refused identically for
 * ever; a closed socket or a timeout is worth another go. nodemailer reports the
 * first kind as an `EAUTH`/`EENVELOPE` code or a 5xx reply, and the second as a
 * socket-level code or a 4xx reply.
 */
function classifySmtpError(error: unknown, config: SmtpConfig): Error {
  const raw = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string } | null)?.code ?? ''
  const replyCode = (error as { responseCode?: number } | null)?.responseCode ?? 0

  if (code === 'EAUTH' || replyCode === 535 || replyCode === 534) {
    return new PermanentEmailRejection(
      `${config.host} refused the login for ${config.user}. With Gmail this must be a 16-character app password, not the account password.`,
    )
  }
  if (code === 'EENVELOPE' || (replyCode >= 500 && replyCode < 600)) {
    return new PermanentEmailRejection(`${config.host} rejected the message: ${raw}`)
  }
  return new Error(`${config.host} could not be reached: ${raw}`)
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const smtp = smtpConfig()
  if (!smtp && !hasEmailProvider()) return sendViaOutbox(message)

  try {
    return smtp ? await sendViaSmtp(smtp, message) : await sendViaResend(message)
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
