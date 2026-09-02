/**
 * Runtime configuration read from the environment, in one place so no module
 * has to guess at a default.
 */

export const APP_NAME = 'BillFlow'
export const APP_TAGLINE = 'Invoicing that gets you paid'

/**
 * The absolute origin used to build share links and email links.
 *
 * `NEXT_PUBLIC_APP_URL` wins when set. On Vercel the deployment URL is injected
 * automatically, which means a preview deployment produces links that point at
 * itself rather than at production.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`

  return 'http://localhost:3000'
}

/** The public, login-free URL for an invoice share token. */
export function publicInvoiceUrl(token: string): string {
  return `${appUrl()}/i/${token}`
}

export function emailFrom(): string {
  const configured = process.env.EMAIL_FROM?.trim()

  /**
   * SMTP servers will not let you claim an address you have not authenticated as
   * - Gmail silently rewrites the header, others reject the message outright. So
   * when SMTP is the transport, the authenticated mailbox wins and `EMAIL_FROM`
   * contributes only the display name.
   */
  const user = smtpConfig()?.user
  if (user) {
    const label = configured?.match(/^\s*([^<]+?)\s*</)?.[1] ?? APP_NAME
    return `${label} <${user}>`
  }

  return configured || 'BillFlow <invoices@billflow.app>'
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}

/**
 * SMTP settings, or null when they are not configured.
 *
 * Only the mailbox and its password are required - the host defaults to Gmail
 * and the port follows from it, because that is the account most people have to
 * hand. Port 465 is implicit TLS; anything else (587) starts plaintext and
 * upgrades with STARTTLS, which is what `secure: false` means to nodemailer.
 */
export function smtpConfig(): SmtpConfig | null {
  const user = process.env.SMTP_USER?.trim() || process.env.EMAIL?.trim()
  const password = process.env.SMTP_PASSWORD?.trim() || process.env.EMAIL_PASSWORD?.trim()
  if (!user || !password) return null

  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT?.trim() || 465)

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    secure: process.env.SMTP_SECURE?.trim() ? process.env.SMTP_SECURE.trim() !== 'false' : port === 465,
    user,
    // Gmail app passwords are shown in groups of four; the spaces are cosmetic.
    password: password.replace(/\s+/g, ''),
  }
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * True when a real email provider is configured.
 *
 * SMTP is checked first because it is the one that can reach any recipient: a
 * Resend account without a verified domain may only write to its own owner, so
 * where both are present, SMTP is the more useful default.
 */
export function hasEmailProvider(): boolean {
  return Boolean(smtpConfig()) || Boolean(process.env.RESEND_API_KEY?.trim())
}

export const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL?.trim() || 'demo@billflow.app'
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD?.trim() || 'Billflow@123'
