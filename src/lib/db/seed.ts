/**
 * Builds the demo dataset.
 *
 * Everything is written through explicit SQL rather than the repositories,
 * because the repositories quite rightly stamp `now()` on every timestamp — and a
 * convincing demo needs seven months of history, an invoice that went overdue two
 * weeks ago and a payment that landed this morning. The arithmetic still goes
 * through `calculateInvoice()`, so no total here was typed by hand.
 *
 * Re-running is safe: the demo user and everything owned by it is removed first,
 * so `npm run db:seed` always lands on the same state.
 */

import { randomBytes } from 'node:crypto'
import { hashPassword } from '@/lib/auth/password'
import { calculateInvoice } from '@/lib/invoice/calc'
import { quantityToDecimal, rateToDecimal, toDecimal } from '@/lib/money'
import type { Queryable } from '@/lib/db'
import { SEED_CLIENTS, SEED_INVOICES, SEED_PROFILE, type SeedInvoice } from './seed-data'

export interface SeedOptions {
  email: string
  password: string
  /** Base URL used to print the share links at the end. */
  appUrl?: string
}

export interface SeededInvoice {
  invoiceNumber: string
  status: string
  total: number
  shareUrl: string | null
  token: string | null
}

export interface SeedReport {
  userId: string
  email: string
  password: string
  clientCount: number
  invoiceCount: number
  invoices: SeededInvoice[]
  payableUrl: string | null
  receiptUrl: string | null
  currency: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Local midnight `offset` days from today — a calendar date, not an instant. */
function dayStart(offset: number): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

/**
 * `YYYY-MM-DD` from local components. Going via `toISOString()` would shift the
 * date a day backwards for anyone east of UTC, which would quietly make "due
 * today" invoices overdue.
 */
function isoDate(offset: number): string {
  const date = dayStart(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** An instant on the day `offset`, at a plausible working hour. */
function at(offset: number, hour = 10, minute = 24): string {
  const date = dayStart(offset)
  date.setHours(hour, minute, 0, 0)
  // Never stamp the future: an invoice created "later today" reads as a bug.
  const now = Date.now()
  return new Date(Math.min(date.getTime(), now)).toISOString()
}

function token(): string {
  return randomBytes(24).toString('base64url')
}

function reference(): string {
  return `PAY-${randomBytes(4).toString('hex')}`
}

function totalsFor(invoice: SeedInvoice) {
  return calculateInvoice({
    items: invoice.items.map((item) => ({ quantityThousandths: item.quantity, rateMinor: item.rate })),
    discountType: invoice.discountType ?? null,
    discountValue: invoice.discountValue ?? 0,
    taxRateBasisPoints: invoice.taxRate,
  })
}

/** Removes the demo account and everything it owns, in dependency order. */
async function clearExisting(tx: Queryable, email: string): Promise<void> {
  const { rows } = await tx.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower(btrim($1))', [
    email,
  ])
  const user = rows[0]
  if (!user) return

  // invoices before clients: clients.id is referenced with ON DELETE RESTRICT,
  // so letting the user delete cascade would trip that constraint.
  await tx.query('DELETE FROM invoices WHERE user_id = $1', [user.id])
  await tx.query('DELETE FROM clients WHERE user_id = $1', [user.id])
  await tx.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
  await tx.query('DELETE FROM business_settings WHERE user_id = $1', [user.id])
  await tx.query('DELETE FROM users WHERE id = $1', [user.id])
}

async function insertUser(tx: Queryable, email: string, password: string): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, created_at, updated_at)
     VALUES (btrim($1), $2, $3, $4, $4)
     RETURNING id`,
    [email, await hashPassword(password), SEED_PROFILE.fullName, at(-260, 9, 5)],
  )
  return rows[0]!.id
}

async function insertSettings(tx: Queryable, userId: string, nextNumber: number): Promise<void> {
  await tx.query(
    `INSERT INTO business_settings
       (user_id, business_name, business_email, phone, address, tax_id, currency,
        invoice_prefix, next_invoice_number, default_tax_rate, default_notes,
        payment_terms_days, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
    [
      userId,
      SEED_PROFILE.businessName,
      SEED_PROFILE.businessEmail,
      SEED_PROFILE.phone,
      SEED_PROFILE.address,
      SEED_PROFILE.taxId,
      SEED_PROFILE.currency,
      SEED_PROFILE.invoicePrefix,
      nextNumber,
      rateToDecimal(SEED_PROFILE.defaultTaxRate),
      SEED_PROFILE.defaultNotes,
      SEED_PROFILE.paymentTermsDays,
      at(-260, 9, 6),
    ],
  )
}

async function insertClients(tx: Queryable, userId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>()

  for (const [index, client] of SEED_CLIENTS.entries()) {
    const createdAt = at(-250 + index * 8, 11, 15)
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO clients (user_id, name, company, email, phone, address, notes, archived_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id`,
      [
        userId,
        client.name,
        client.company,
        client.email,
        client.phone,
        client.address,
        client.notes,
        client.archived ? at(-40, 16, 30) : null,
        createdAt,
      ],
    )
    ids.set(client.key, rows[0]!.id)
  }

  return ids
}

/** The letterhead frozen onto every seeded invoice, exactly as the app freezes it. */
const SNAPSHOT = {
  businessName: SEED_PROFILE.businessName,
  businessEmail: SEED_PROFILE.businessEmail,
  phone: SEED_PROFILE.phone,
  address: SEED_PROFILE.address,
  taxId: SEED_PROFILE.taxId,
  logoUrl: null,
}

/** Never stamp an offset in the future. */
const past = (offset: number) => Math.min(offset, 0)

async function insertInvoice(
  tx: Queryable,
  userId: string,
  clientIds: Map<string, string>,
  invoice: SeedInvoice,
  invoiceNumber: string,
): Promise<SeededInvoice> {
  const clientId = clientIds.get(invoice.client)
  if (!clientId) throw new Error(`Seed invoice references unknown client "${invoice.client}"`)

  const totals = totalsFor(invoice)
  const views = invoice.views ?? 0
  const reminders = invoice.reminders ?? 0

  const createdAt = at(invoice.issue, 9, 40)
  const sentAt = invoice.status === 'draft' ? null : at(invoice.sent ?? invoice.issue, 10, 5)
  const paidAt = invoice.status === 'paid' ? at(invoice.paid ?? 0, 14, 20) : null
  const firstViewedAt = views > 0 ? at(past((invoice.sent ?? invoice.issue) + 1), 12, 8) : null
  const lastViewedAt = views > 0 ? (paidAt ?? at(past(invoice.remindedAt ?? -1), 15, 42)) : null
  const reminderSentAt = reminders > 0 ? at(past(invoice.remindedAt ?? -5), 11, 0) : null

  // Sending an invoice mints a share link, so every invoice that has left the
  // building has one — `share` only marks the two the demo script points at.
  const publicToken = invoice.status === 'draft' ? null : token()

  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO invoices
       (user_id, client_id, invoice_number, issue_date, due_date, status, currency,
        subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount, total,
        notes, business_snapshot, public_token, sent_at, first_viewed_at, last_viewed_at,
        view_count, reminder_sent_at, reminder_count, paid_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb,
             $17, $18, $19, $20, $21, $22, $23, $24, $25, $25)
     RETURNING id`,
    [
      userId,
      clientId,
      invoiceNumber,
      isoDate(invoice.issue),
      isoDate(invoice.due),
      invoice.status,
      SEED_PROFILE.currency,
      toDecimal(totals.subtotal),
      invoice.discountType ?? null,
      toDecimal(invoice.discountValue ?? 0),
      toDecimal(totals.discountAmount),
      rateToDecimal(invoice.taxRate),
      toDecimal(totals.taxAmount),
      toDecimal(totals.total),
      invoice.notes,
      JSON.stringify(SNAPSHOT),
      publicToken,
      sentAt,
      firstViewedAt,
      lastViewedAt,
      views,
      reminderSentAt,
      reminders,
      paidAt,
      createdAt,
    ],
  )
  const invoiceId = rows[0]!.id

  for (const [position, item] of invoice.items.entries()) {
    await tx.query(
      `INSERT INTO invoice_items (invoice_id, description, detail, quantity, rate, amount, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        invoiceId,
        item.description,
        item.detail,
        quantityToDecimal(item.quantity),
        toDecimal(item.rate),
        toDecimal(totals.itemAmounts[position] ?? 0),
        position,
        createdAt,
      ],
    )
  }

  const events: Array<[string, Record<string, unknown>, string]> = [['created', {}, createdAt]]
  if (sentAt) events.push(['sent', { to: SEED_CLIENTS.find((c) => c.key === invoice.client)?.email ?? '', via: 'email' }, sentAt])
  if (firstViewedAt) events.push(['viewed', {}, firstViewedAt])
  if (reminderSentAt) events.push(['reminder_sent', { count: reminders }, reminderSentAt])

  let paymentReference: string | null = null
  if (paidAt) {
    paymentReference = reference()
    await tx.query(
      `INSERT INTO payments
         (invoice_id, amount, currency, method, reference, status, card_last4, payer_note,
          idempotency_key, paid_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, $7, $8, $9, $9)`,
      [
        invoiceId,
        toDecimal(totals.total),
        SEED_PROFILE.currency,
        invoice.method ?? 'bank_transfer',
        paymentReference,
        invoice.method === 'card' ? '4242' : null,
        '',
        `seed-${invoiceNumber}`,
        paidAt,
      ],
    )
    events.push([
      'payment_received',
      { reference: paymentReference, amount: totals.total, method: invoice.method ?? 'bank_transfer' },
      paidAt,
    ])
  }

  for (const [type, metadata, createdAtStamp] of events) {
    await tx.query(
      'INSERT INTO invoice_events (invoice_id, type, metadata, created_at) VALUES ($1, $2, $3::jsonb, $4)',
      [invoiceId, type, JSON.stringify(metadata), createdAtStamp],
    )
  }

  return {
    invoiceNumber,
    status: invoice.status,
    total: totals.total,
    token: publicToken,
    shareUrl: null,
  }
}

/**
 * Writes the whole demo dataset in one transaction, so a failure halfway through
 * leaves the database exactly as it was rather than half-seeded.
 */
export async function seedDemoData(tx: Queryable, options: SeedOptions): Promise<SeedReport> {
  const base = (options.appUrl ?? 'http://localhost:3000').replace(/\/+$/, '')

  await clearExisting(tx, options.email)

  const userId = await insertUser(tx, options.email, options.password)
  await insertSettings(tx, userId, SEED_INVOICES.length + 1)
  const clientIds = await insertClients(tx, userId)

  const seeded: SeededInvoice[] = []
  let payableUrl: string | null = null
  let receiptUrl: string | null = null

  for (const [index, invoice] of SEED_INVOICES.entries()) {
    const invoiceNumber = `${SEED_PROFILE.invoicePrefix}-${String(index + 1).padStart(4, '0')}`
    const row = await insertInvoice(tx, userId, clientIds, invoice, invoiceNumber)
    row.shareUrl = row.token ? `${base}/i/${row.token}` : null
    seeded.push(row)

    if (invoice.share && row.shareUrl) {
      if (invoice.status === 'paid') receiptUrl ??= row.shareUrl
      else payableUrl ??= row.shareUrl
    }
  }

  return {
    userId,
    email: options.email,
    password: options.password,
    clientCount: SEED_CLIENTS.length,
    invoiceCount: seeded.length,
    invoices: seeded,
    payableUrl,
    receiptUrl,
    currency: SEED_PROFILE.currency,
  }
}



