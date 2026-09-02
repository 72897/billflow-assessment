/**
 * The public (unauthenticated) surface: one invoice, reachable only by its
 * share token.
 *
 * The projection here is deliberately narrow — it carries no ids, no user
 * information and no internal timeline. The token is the credential, so
 * revoking it (setting `public_token` to NULL) makes the URL 404 on the next
 * request with nothing else to clean up.
 */

import { getDb, queryOne, transaction } from '@/lib/db'
import { ConflictError, NotFoundError } from '@/lib/errors'
import type { PublicInvoice } from '@/types'
import type { DiscountType } from '@/lib/invoice/calc'
import type { DisplayStatus } from '@/lib/invoice/status'
import { addEvent, listItems, settleInvoiceInTx, type SettleResult } from './invoices'
import { mapPayment, money, text, ts } from './mappers'

const PUBLIC_COLUMNS = `
  i.id, i.user_id, i.invoice_number,
  i.issue_date::text AS issue_date,
  i.due_date::text   AS due_date,
  i.status,
  invoice_display_status(i.status, i.due_date, i.paid_at) AS display_status,
  i.currency,
  i.subtotal::text        AS subtotal,
  i.discount_type,
  i.discount_value::text  AS discount_value,
  i.discount_amount::text AS discount_amount,
  i.tax_rate::text        AS tax_rate,
  i.tax_amount::text      AS tax_amount,
  i.total::text           AS total,
  i.notes, i.paid_at, i.business_snapshot,
  cl.name AS client_name, cl.company AS client_company, cl.email AS client_email,
  cl.address AS client_address, cl.phone AS client_phone,
  bs.business_name, bs.business_email, bs.phone AS business_phone,
  bs.address AS business_address, bs.tax_id, bs.logo_url
`

const PUBLIC_FROM = `
  FROM invoices i
  JOIN clients cl ON cl.id = i.client_id
  LEFT JOIN business_settings bs ON bs.user_id = i.user_id
`

/**
 * Cheap shape check before touching the database, so a crawler hitting
 * /i/wp-admin.php costs nothing.
 */
export function looksLikeToken(token: string): boolean {
  return token.length >= 16 && token.length <= 64 && /^[A-Za-z0-9_-]+$/.test(token)
}
interface PublicRow extends Record<string, unknown> {
  id: string
  user_id: string
}

async function loadRow(token: string): Promise<PublicRow | null> {
  if (!looksLikeToken(token)) return null
  const row = await queryOne<PublicRow>(
    `SELECT ${PUBLIC_COLUMNS}
     ${PUBLIC_FROM}
      WHERE i.public_token = $1 AND i.archived_at IS NULL
      LIMIT 1`,
    [token],
  )
  return row ?? null
}

/**
 * The snapshot frozen at creation wins, so a later logo or address change never
 * rewrites an invoice the client already has. Live settings are only a fallback
 * for rows created before snapshots existed.
 */
function businessFrom(row: PublicRow): PublicInvoice['business'] {
  const live = {
    businessName: text(row.business_name),
    businessEmail: text(row.business_email),
    phone: text(row.business_phone),
    address: text(row.business_address),
    taxId: text(row.tax_id),
    logoUrl: row.logo_url ? text(row.logo_url) : null,
  }
  const raw = row.business_snapshot
  const snapshot = (typeof raw === 'string' ? safeParse(raw) : raw) as Partial<typeof live> | null
  if (!snapshot || typeof snapshot !== 'object') return live
  return {
    businessName: snapshot.businessName || live.businessName,
    businessEmail: snapshot.businessEmail || live.businessEmail,
    phone: snapshot.phone || live.phone,
    address: snapshot.address || live.address,
    taxId: snapshot.taxId || live.taxId,
    logoUrl: snapshot.logoUrl ?? live.logoUrl,
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
async function project(row: PublicRow): Promise<PublicInvoice> {
  const db = await getDb()
  const [items, paymentRow] = await Promise.all([
    listItems(db, row.id),
    db.query(
      `SELECT id, invoice_id, amount::text AS amount, currency, method, reference, status,
              card_last4, payer_note, paid_at, created_at
         FROM payments
        WHERE invoice_id = $1 AND status = 'succeeded'
        ORDER BY paid_at DESC
        LIMIT 1`,
      [row.id],
    ),
  ])

  const payment = paymentRow.rows[0] ? mapPayment(paymentRow.rows[0]) : null

  return {
    invoiceNumber: text(row.invoice_number),
    issueDate: text(row.issue_date).slice(0, 10),
    dueDate: text(row.due_date).slice(0, 10),
    displayStatus: text(row.display_status, 'sent') as DisplayStatus,
    currency: text(row.currency, 'INR'),
    subtotal: money(row.subtotal),
    discountType: (row.discount_type ? text(row.discount_type) : null) as DiscountType | null,
    discountValue: money(row.discount_value),
    discountAmount: money(row.discount_amount),
    taxRate: money(row.tax_rate),
    taxAmount: money(row.tax_amount),
    total: money(row.total),
    notes: text(row.notes),
    items,
    business: businessFrom(row),
    client: {
      name: text(row.client_name),
      company: text(row.client_company),
      email: text(row.client_email),
      address: text(row.client_address),
      phone: text(row.client_phone),
    },
    paidAt: ts(row.paid_at),
    payment: payment
      ? {
          reference: payment.reference,
          amount: payment.amount,
          method: payment.method,
          cardLast4: payment.cardLast4,
          paidAt: payment.paidAt,
        }
      : null,
  }
}

export async function findPublicInvoice(token: string): Promise<PublicInvoice | null> {
  const row = await loadRow(token)
  return row ? project(row) : null
}

export async function getPublicInvoiceOrThrow(token: string): Promise<PublicInvoice> {
  const invoice = await findPublicInvoice(token)
  if (!invoice) throw new NotFoundError('This invoice link is no longer active.')
  return invoice
}
/** Minutes of quiet before another page load counts as a separate view. */
const VIEW_WINDOW_MINUTES = 15

/**
 * Records that the client opened the link. `last_viewed_at` always moves, but a
 * refresh inside the window does not inflate the counter or add another
 * timeline entry, so "Viewed 3 times" stays meaningful (SHR-06).
 */
export async function recordPublicView(token: string): Promise<void> {
  if (!looksLikeToken(token)) return

  await transaction(async (tx) => {
    const found = await tx.query<{ id: string; stale: boolean }>(
      `SELECT id,
              (last_viewed_at IS NULL OR last_viewed_at < now() - make_interval(mins => $2::int)) AS stale
         FROM invoices
        WHERE public_token = $1 AND archived_at IS NULL
        FOR UPDATE`,
      [token, VIEW_WINDOW_MINUTES],
    )
    const row = found.rows[0]
    if (!row) return

    const counts = row.stale === true || String(row.stale) === 't'

    await tx.query(
      `UPDATE invoices
          SET last_viewed_at = now(),
              first_viewed_at = coalesce(first_viewed_at, now()),
              view_count = view_count + CASE WHEN $2::boolean THEN 1 ELSE 0 END
        WHERE id = $1`,
      [row.id, counts],
    )

    if (counts) {
      await addEvent(tx, row.id, 'viewed', {})
    }
  })
}
export interface PublicPaymentInput {
  method: 'card' | 'bank_transfer'
  payerNote?: string
  idempotencyKey: string
  /** Minor-units total the page displayed, echoed back to detect a change. */
  expectedTotal?: string
}

export interface PublicPaymentResult {
  invoice: PublicInvoice
  payment: SettleResult['payment']
  alreadyPaid: boolean
}

/**
 * Settlement without a payment processor: no card is charged, but everything
 * around it is real — the invoice row is locked, the payment is written in the
 * same transaction as the status change, and the idempotency key makes a
 * double-clicked Pay button a no-op (PAY-03). Dropping in Stripe or Razorpay
 * later means calling their intent API where the card is stamped below; the
 * locking, the ledger row and the idempotency guard already hold.
 */
export async function payPublicInvoice(token: string, input: PublicPaymentInput): Promise<PublicPaymentResult> {
  if (!looksLikeToken(token)) throw new NotFoundError('This invoice link is no longer active.')

  const result = await transaction(async (tx) => {
    const found = await tx.query<{ id: string; total: string }>(
      `SELECT id, total::text AS total
         FROM invoices
        WHERE public_token = $1 AND archived_at IS NULL
        FOR UPDATE`,
      [token],
    )
    const row = found.rows[0]
    if (!row) throw new NotFoundError('This invoice link is no longer active.')

    // The client pays what they were shown, or not at all (PAY-05).
    if (input.expectedTotal) {
      const expected = Number.parseInt(input.expectedTotal, 10)
      if (Number.isFinite(expected) && expected !== money(row.total)) {
        throw new ConflictError('This invoice changed while you were paying. Refresh to see the current total.')
      }
    }

    return settleInvoiceInTx(tx, row.id, {
      method: input.method,
      payerNote: input.payerNote ?? '',
      // A simulated card: the classic test number's last four digits.
      cardLast4: input.method === 'card' ? '4242' : null,
      idempotencyKey: input.idempotencyKey,
    })
  })

  return {
    invoice: await getPublicInvoiceOrThrow(token),
    payment: result.payment,
    alreadyPaid: result.alreadyPaid,
  }
}

