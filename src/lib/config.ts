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
  return process.env.EMAIL_FROM?.trim() || 'BillFlow <invoices@billflow.app>'
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** True when a real email provider is configured. */
export function hasEmailProvider(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

export const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL?.trim() || 'demo@billflow.app'
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD?.trim() || 'Billflow@123'
