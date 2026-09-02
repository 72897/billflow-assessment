/**
 * Invoice repository.
 *
 * Two rules hold throughout:
 *   - every statement is scoped by `user_id`, so one account can never read or
 *     write another's rows even when it guesses a valid id (INV-19);
 *   - totals are always recalculated here from the line items before a write.
 *     Amounts arriving from a client are input, never truth (INV-18).
 */

import { generatePublicToken, generateReference } from '@/lib/auth/session'
import { getDb, query, queryOne, transaction, type Queryable } from '@/lib/db'
import { ConflictError, InvoiceStateError, NotFoundError } from '@/lib/errors'
import { calculateInvoice } from '@/lib/invoice/calc'
import { quantityToDecimal, toDecimal } from '@/lib/money'
import type { CreateInvoiceInput, InvoiceListQuery, UpdateInvoiceInput } from '@/lib/validation/invoice'
import type {
  Client,
  InvoiceDetail,
  InvoiceEvent,
  InvoiceItem,
  InvoiceListItem,
  Paginated,
  Payment,
} from '@/types'
import { likePattern } from './clients'
import {
  int,
  mapClient,
  mapEvent,
  mapInvoiceListItem,
  mapItem,
  mapPayment,
  mapSnapshot,
  money,
  text,
  ts,
  tsRequired,
} from './mappers'
import { getBusinessSnapshot } from './settings'
import { totalFor } from './paging'

/**
 * `display_status` is computed in SQL by the same rules as the TypeScript
 * `deriveDisplayStatus`, so the pill in the table and the pill on the invoice
 * page can never disagree, and nothing has to run a job to mark invoices
 * overdue (INV-15).
 */
const LIST_COLUMNS = `
  i.id, i.invoice_number,
  i.issue_date::text AS issue_date,
  i.due_date::text   AS due_date,
  i.status,
  invoice_display_status(i.status, i.due_date, i.paid_at) AS display_status,
  i.currency, i.client_id,
  cl.name AS client_name, cl.company AS client_company, cl.email AS client_email,
  i.subtotal::text        AS subtotal,
  i.discount_type,
  i.discount_value::text  AS discount_value,
  i.discount_amount::text AS discount_amount,
  i.tax_rate::text        AS tax_rate,
  i.tax_amount::text      AS tax_amount,
  i.total::text           AS total,
  i.sent_at, i.paid_at, i.first_viewed_at, i.last_viewed_at,
  i.view_count, i.reminder_count,
  (i.public_token IS NOT NULL) AS has_public_link,
  (SELECT count(*) FROM invoice_items it WHERE it.invoice_id = i.id)::int AS item_count,
  i.created_at
`

const LIST_FROM = `
  FROM invoices i
  JOIN clients cl ON cl.id = i.client_id
`
const SORT_SQL: Record<InvoiceListQuery['sort'], string> = {
  newest: 'i.issue_date DESC, i.created_at DESC',
  oldest: 'i.issue_date ASC, i.created_at ASC',
  due_date: 'i.due_date ASC, i.created_at DESC',
  due_date_desc: 'i.due_date DESC, i.created_at DESC',
  amount_desc: 'i.total DESC, i.created_at DESC',
  amount_asc: 'i.total ASC, i.created_at DESC',
  number_asc: 'lower(i.invoice_number) ASC',
  number_desc: 'lower(i.invoice_number) DESC',
}

/**
 * The status filter matches what the user sees, so "Sent" excludes anything
 * already overdue. Written out longhand rather than calling
 * `invoice_display_status()` so the (user_id, status) and (user_id, due_date)
 * indexes still apply.
 */
const STATUS_PREDICATE = {
  draft: "i.status = 'draft'",
  paid: "i.status = 'paid'",
  sent: "i.status = 'sent' AND i.due_date >= CURRENT_DATE",
  overdue: "i.status = 'sent' AND i.due_date < CURRENT_DATE",
} as const

function statusPredicate(status: InvoiceListQuery['status']): string | null {
  return status === 'all' ? null : STATUS_PREDICATE[status]
}

/**
 * The filter half of a list query, shared by `listInvoices` and the tab counts
 * so the number on a tab is always the number of rows that tab will show.
 *
 * `includeStatus: false` leaves the status predicate out, which is what the
 * counts need: every tab is counted against the same search, client and date
 * range, differing only in status.
 */
function buildFilters(
  userId: string,
  params: InvoiceListQuery,
  { includeStatus = true }: { includeStatus?: boolean } = {},
): { where: string[]; values: unknown[] } {
  const values: unknown[] = [userId]
  const where: string[] = ['i.user_id = $1', 'i.archived_at IS NULL']

  if (includeStatus) {
    const status = statusPredicate(params.status)
    if (status) where.push(status)
  }

  if (params.client) {
    values.push(params.client)
    where.push(`i.client_id = $${values.length}`)
  }

  if (params.q) {
    values.push(likePattern(params.q))
    const index = values.length
    where.push(
      `(i.invoice_number ILIKE $${index} OR cl.name ILIKE $${index}` +
        ` OR cl.company ILIKE $${index} OR cl.email ILIKE $${index})`,
    )
  }

  if (params.from) {
    values.push(params.from)
    where.push(`i.issue_date >= $${values.length}::date`)
  }

  if (params.to) {
    values.push(params.to)
    where.push(`i.issue_date <= $${values.length}::date`)
  }

  return { where, values }
}

/**
 * Everything — search, status, client, date range, sort, pagination — happens
 * in this one statement, because the brief requires filtering to be done on
 * the server and a 2 000-invoice account should not ship 2 000 rows to the
 * browser to filter three of them out.
 */
export async function listInvoices(userId: string, params: InvoiceListQuery): Promise<Paginated<InvoiceListItem>> {
  const { where, values } = buildFilters(userId, params)

  const offset = (params.page - 1) * params.perPage
  values.push(params.perPage, offset)

  const { rows } = await query(
    `SELECT ${LIST_COLUMNS}, count(*) OVER ()::int AS total_rows
     ${LIST_FROM}
      WHERE ${where.join(' AND ')}
      ORDER BY ${SORT_SQL[params.sort]}, i.id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  const total = await totalFor(LIST_FROM, where, values.slice(0, -2), rows, params.page)
  return {
    rows: rows.map(mapInvoiceListItem),
    page: params.page,
    perPage: params.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.perPage)),
  }
}

export interface InvoiceStatusCounts {
  all: number
  draft: number
  sent: number
  paid: number
  overdue: number
}

/**
 * How many invoices each status tab would show under the *current* search,
 * client and date filters.
 *
 * One statement with five `FILTER` clauses rather than five round trips. The
 * predicates are the same strings the list query uses, so a tab that reads "3"
 * cannot open onto four rows — and "Sent" excludes overdue here for the same
 * reason it does there: the tabs mirror the labels the user sees.
 */
export async function countInvoicesByStatus(userId: string, params: InvoiceListQuery): Promise<InvoiceStatusCounts> {
  const { where, values } = buildFilters(userId, params, { includeStatus: false })

  // `all` is a reserved word, so it is the one column that needs a different name.
  const row = await queryOne<{ all_count: number; draft: number; sent: number; paid: number; overdue: number }>(
    `SELECT count(*)::int AS all_count,
            count(*) FILTER (WHERE ${STATUS_PREDICATE.draft})::int   AS draft,
            count(*) FILTER (WHERE ${STATUS_PREDICATE.sent})::int    AS sent,
            count(*) FILTER (WHERE ${STATUS_PREDICATE.paid})::int    AS paid,
            count(*) FILTER (WHERE ${STATUS_PREDICATE.overdue})::int AS overdue
     ${LIST_FROM}
      WHERE ${where.join(' AND ')}`,
    values,
  )

  return {
    all: int(row?.all_count),
    draft: int(row?.draft),
    sent: int(row?.sent),
    paid: int(row?.paid),
    overdue: int(row?.overdue),
  }
}

export async function listRecentInvoices(userId: string, limit = 5): Promise<InvoiceListItem[]> {
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS}
     ${LIST_FROM}
      WHERE i.user_id = $1 AND i.archived_at IS NULL
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT $2`,
    [userId, limit],
  )
  return rows.map(mapInvoiceListItem)
}

export async function listInvoicesForClient(userId: string, clientId: string, limit = 50): Promise<InvoiceListItem[]> {
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS}
     ${LIST_FROM}
      WHERE i.user_id = $1 AND i.client_id = $2 AND i.archived_at IS NULL
      ORDER BY i.issue_date DESC, i.created_at DESC
      LIMIT $3`,
    [userId, clientId, limit],
  )
  return rows.map(mapInvoiceListItem)
}

export async function countInvoices(userId: string): Promise<number> {
  const row = await queryOne<{ total: number }>(
    'SELECT count(*)::int AS total FROM invoices WHERE user_id = $1 AND archived_at IS NULL',
    [userId],
  )
  return int(row?.total)
}

export async function isInvoiceNumberTaken(userId: string, invoiceNumber: string, excludeId?: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM invoices
        WHERE user_id = $1 AND lower(invoice_number) = lower($2)
          AND ($3::uuid IS NULL OR id <> $3::uuid)
     ) AS exists`,
    [userId, invoiceNumber, excludeId ?? null],
  )
  return row?.exists === true
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

const DETAIL_EXTRA = `
  i.notes, i.public_token, i.reminder_sent_at, i.archived_at, i.updated_at,
  i.business_snapshot
`

const CLIENT_ROW = `
  id, user_id, name, company, email, phone, address, notes,
  archived_at, created_at, updated_at
`
export async function listItems(db: Queryable, invoiceId: string): Promise<InvoiceItem[]> {
  const { rows } = await db.query(
    `SELECT id, description, detail, quantity::text AS quantity, rate::text AS rate,
            amount::text AS amount, position
       FROM invoice_items
      WHERE invoice_id = $1
      ORDER BY position ASC, created_at ASC`,
    [invoiceId],
  )
  return rows.map(mapItem)
}

export async function listEvents(db: Queryable, invoiceId: string): Promise<InvoiceEvent[]> {
  const { rows } = await db.query(
    `SELECT id, type, metadata, created_at
       FROM invoice_events
      WHERE invoice_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 100`,
    [invoiceId],
  )
  return rows.map(mapEvent)
}

export async function listPayments(db: Queryable, invoiceId: string): Promise<Payment[]> {
  const { rows } = await db.query(
    `SELECT id, invoice_id, amount::text AS amount, currency, method, reference, status,
            card_last4, payer_note, paid_at, created_at
       FROM payments
      WHERE invoice_id = $1 AND status = 'succeeded'
      ORDER BY paid_at DESC`,
    [invoiceId],
  )
  return rows.map(mapPayment)
}

async function loadClient(db: Queryable, clientId: string): Promise<Client | null> {
  const { rows } = await db.query(`SELECT ${CLIENT_ROW} FROM clients WHERE id = $1 LIMIT 1`, [clientId])
  return rows[0] ? mapClient(rows[0]) : null
}

/** Empty stand-in so a detail payload is never half-built if a client row vanished. */
function placeholderClient(id: string): Client {
  const now = new Date(0).toISOString()
  return {
    id,
    userId: '',
    name: 'Deleted client',
    company: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}
/**
 * The whole invoice page in one payload: header, items, client, timeline,
 * payments. Archived invoices are excluded, so a paid invoice the user deleted
 * (archived, to keep its payment record) 404s like any other deleted row —
 * `restoreInvoice` is what brings it back.
 */
export async function findInvoiceDetail(userId: string, invoiceId: string): Promise<InvoiceDetail | null> {
  const row = await queryOne(
    `SELECT ${LIST_COLUMNS}, ${DETAIL_EXTRA}
     ${LIST_FROM}
      WHERE i.user_id = $1 AND i.id = $2 AND i.archived_at IS NULL
      LIMIT 1`,
    [userId, invoiceId],
  )
  if (!row) return null

  const db = await getDbHandle()
  const [items, events, payments, client, fallbackBusiness] = await Promise.all([
    listItems(db, invoiceId),
    listEvents(db, invoiceId),
    listPayments(db, invoiceId),
    loadClient(db, text(row.client_id)),
    getBusinessSnapshot(userId),
  ])

  return {
    ...mapInvoiceListItem(row),
    notes: text(row.notes),
    publicToken: row.public_token ? text(row.public_token) : null,
    reminderSentAt: ts(row.reminder_sent_at),
    archivedAt: ts(row.archived_at),
    updatedAt: tsRequired(row.updated_at),
    items,
    client: client ?? placeholderClient(text(row.client_id)),
    business: mapSnapshot(row.business_snapshot, fallbackBusiness),
    events,
    payments,
  }
}

export async function getInvoiceOrThrow(userId: string, invoiceId: string): Promise<InvoiceDetail> {
  const invoice = await findInvoiceDetail(userId, invoiceId)
  if (!invoice) throw new NotFoundError('That invoice could not be found.')
  return invoice
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function getDbHandle(): Promise<Queryable> {
  return getDb()
}

/** Appends to the audit trail that drives the activity timeline. */
export async function addEvent(
  db: Queryable,
  invoiceId: string,
  type: InvoiceEvent['type'],
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.query('INSERT INTO invoice_events (invoice_id, type, metadata) VALUES ($1, $2, $3::jsonb)', [
    invoiceId,
    type,
    JSON.stringify(metadata),
  ])
}
interface ItemInput {
  description: string
  detail: string
  /** Thousandths. */
  quantity: number
  /** Minor units. */
  rate: number
}

interface TotalsInput {
  items: readonly ItemInput[]
  discountType?: 'percentage' | 'fixed' | null
  discountValue?: number
  taxRate?: number
}

function totalsFor(input: TotalsInput) {
  return calculateInvoice({
    items: input.items.map((item) => ({ quantityThousandths: item.quantity, rateMinor: item.rate })),
    discountType: input.discountType ?? null,
    discountValue: input.discountValue ?? 0,
    taxRateBasisPoints: input.taxRate ?? 0,
  })
}

/** One multi-row INSERT keeps a 100-item invoice to a single round trip. */
async function insertItems(
  tx: Queryable,
  invoiceId: string,
  items: readonly ItemInput[],
  amounts: readonly number[],
): Promise<void> {
  if (items.length === 0) return
  const values: unknown[] = [invoiceId]
  const tuples = items.map((item, index) => {
    const base = values.length
    values.push(
      item.description,
      item.detail,
      quantityToDecimal(item.quantity),
      toDecimal(item.rate),
      toDecimal(amounts[index] ?? 0),
      index,
    )
    return `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
  })

  await tx.query(
    `INSERT INTO invoice_items (invoice_id, description, detail, quantity, rate, amount, position)
     VALUES ${tuples.join(', ')}`,
    values,
  )
}

async function assertClientOwned(tx: Queryable, userId: string, clientId: string): Promise<void> {
  const { rows } = await tx.query('SELECT id FROM clients WHERE user_id = $1 AND id = $2', [userId, clientId])
  if (!rows[0]) {
    throw new ConflictError('That client could not be found.', { clientId: ['Choose a client from your list'] })
  }
}
/**
 * Resolves the number to store. When the user accepted the suggested number we
 * call `allocate_invoice_number()`, which locks the settings row, skips numbers
 * already taken and advances the counter — so two invoices created at the same
 * instant cannot collide (INV-14). A number the user typed themselves is used
 * verbatim and leaves the counter alone.
 */
async function resolveInvoiceNumber(tx: Queryable, userId: string, requested: string): Promise<string> {
  const peeked = await tx.query<{ number: string }>('SELECT peek_invoice_number($1) AS number', [userId])
  const suggestion = peeked.rows[0]?.number ?? ''

  if (!requested || requested.toLowerCase() === suggestion.toLowerCase()) {
    const allocated = await tx.query<{ number: string }>('SELECT allocate_invoice_number($1) AS number', [userId])
    return allocated.rows[0]?.number ?? requested
  }
  return requested
}

function duplicateNumber(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null
  return err?.code === '23505' && /invoices_user_number_key/.test(err.message ?? '')
}

export async function createInvoice(userId: string, input: CreateInvoiceInput): Promise<InvoiceDetail> {
  // Ensures the settings row exists before the transaction needs to lock it.
  const business = await getBusinessSnapshot(userId)
  const totals = totalsFor(input)

  const invoiceId = await transaction(async (tx) => {
    await assertClientOwned(tx, userId, input.clientId)
    const invoiceNumber = await resolveInvoiceNumber(tx, userId, input.invoiceNumber)

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO invoices (
         user_id, client_id, invoice_number, issue_date, due_date, status, currency,
         subtotal, discount_type, discount_value, discount_amount,
         tax_rate, tax_amount, total, notes, business_snapshot
       ) VALUES (
         $1, $2, $3, $4::date, $5::date, 'draft', $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14, $15::jsonb
       )
       RETURNING id`,
      [
        userId,
        input.clientId,
        invoiceNumber,
        input.issueDate,
        input.dueDate,
        input.currency,
        toDecimal(totals.subtotal),
        input.discountType ?? null,
        toDecimal(input.discountValue ?? 0),
        toDecimal(totals.discountAmount),
        toDecimal(input.taxRate ?? 0),
        toDecimal(totals.taxAmount),
        toDecimal(totals.total),
        input.notes,
        JSON.stringify(business),
      ],
    )

    const id = rows[0]!.id
    await insertItems(tx, id, input.items, totals.itemAmounts)
    await addEvent(tx, id, 'created', { invoiceNumber, total: totals.total, itemCount: input.items.length })
    return id
  }).catch((error: unknown) => {
    if (duplicateNumber(error)) {
      throw new ConflictError('That invoice number is already in use.', {
        invoiceNumber: ['That invoice number is already in use'],
      })
    }
    throw error
  })

  return getInvoiceOrThrow(userId, invoiceId)
}
/**
 * Editing is allowed on drafts freely, on sent invoices only with an explicit
 * confirmation, and never on paid ones (INV-12). Items are replaced wholesale:
 * an edit is a new revision of the document, and nothing references item ids.
 */
export async function updateInvoice(
  userId: string,
  invoiceId: string,
  input: UpdateInvoiceInput,
): Promise<InvoiceDetail> {
  const totals = totalsFor(input)

  await transaction(async (tx) => {
    const current = await tx.query<{ status: string }>(
      'SELECT status FROM invoices WHERE user_id = $1 AND id = $2 AND archived_at IS NULL FOR UPDATE',
      [userId, invoiceId],
    )
    const row = current.rows[0]
    if (!row) throw new NotFoundError('That invoice could not be found.')

    if (row.status === 'paid') {
      throw new InvoiceStateError('A paid invoice cannot be edited. Duplicate it if you need to bill again.', {
        status: 'paid',
      })
    }
    if (row.status === 'sent' && !input.confirmSentEdit) {
      throw new InvoiceStateError(
        'This invoice has already been sent. Confirm to edit it — your client may be holding the earlier version.',
        { status: 'sent', requiresConfirmation: true },
      )
    }

    await assertClientOwned(tx, userId, input.clientId)

    await tx.query(
      `UPDATE invoices
          SET client_id = $3, invoice_number = $4, issue_date = $5::date, due_date = $6::date,
              currency = $7, subtotal = $8, discount_type = $9, discount_value = $10,
              discount_amount = $11, tax_rate = $12, tax_amount = $13, total = $14, notes = $15
        WHERE user_id = $1 AND id = $2`,
      [
        userId,
        invoiceId,
        input.clientId,
        input.invoiceNumber,
        input.issueDate,
        input.dueDate,
        input.currency,
        toDecimal(totals.subtotal),
        input.discountType ?? null,
        toDecimal(input.discountValue ?? 0),
        toDecimal(totals.discountAmount),
        toDecimal(input.taxRate ?? 0),
        toDecimal(totals.taxAmount),
        toDecimal(totals.total),
        input.notes,
      ],
    )

    await tx.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId])
    await insertItems(tx, invoiceId, input.items, totals.itemAmounts)
    await addEvent(tx, invoiceId, 'updated', {
      total: totals.total,
      itemCount: input.items.length,
      afterSend: row.status === 'sent',
    })
  }).catch((error: unknown) => {
    if (duplicateNumber(error)) {
      throw new ConflictError('That invoice number is already in use.', {
        invoiceNumber: ['That invoice number is already in use'],
      })
    }
    throw error
  })

  return getInvoiceOrThrow(userId, invoiceId)
}
export interface DeleteInvoiceResult {
  outcome: 'deleted' | 'archived'
}

/**
 * Drafts are deleted. A sent invoice needs `force`, because the client may
 * already be holding it. A paid invoice is archived rather than deleted — the
 * payment record has to survive (INV-13).
 */
export async function deleteInvoice(userId: string, invoiceId: string, force = false): Promise<DeleteInvoiceResult> {
  return transaction(async (tx) => {
    const current = await tx.query<{ status: string; invoice_number: string }>(
      'SELECT status, invoice_number FROM invoices WHERE user_id = $1 AND id = $2 FOR UPDATE',
      [userId, invoiceId],
    )
    const row = current.rows[0]
    if (!row) throw new NotFoundError('That invoice could not be found.')

    if (row.status === 'paid') {
      await tx.query('UPDATE invoices SET archived_at = now() WHERE user_id = $1 AND id = $2', [userId, invoiceId])
      return { outcome: 'archived' as const }
    }

    if (row.status === 'sent' && !force) {
      throw new InvoiceStateError(
        `${row.invoice_number} has already been sent. Deleting it removes your copy — your client keeps theirs.`,
        { status: 'sent', requiresConfirmation: true },
      )
    }

    await tx.query('DELETE FROM invoices WHERE user_id = $1 AND id = $2', [userId, invoiceId])
    return { outcome: 'deleted' as const }
  })
}

export async function archiveInvoice(userId: string, invoiceId: string): Promise<void> {
  const { rowCount } = await query('UPDATE invoices SET archived_at = now() WHERE user_id = $1 AND id = $2', [
    userId,
    invoiceId,
  ])
  if (rowCount === 0) throw new NotFoundError('That invoice could not be found.')
}

export async function restoreInvoice(userId: string, invoiceId: string): Promise<void> {
  const { rowCount } = await query('UPDATE invoices SET archived_at = NULL WHERE user_id = $1 AND id = $2', [
    userId,
    invoiceId,
  ])
  if (rowCount === 0) throw new NotFoundError('That invoice could not be found.')
}
/**
 * Copies an invoice into a fresh draft: today's issue date, the same interval
 * to the due date, a newly allocated number, and current branding. The copy
 * starts unsent with no payment history of its own.
 */
export async function duplicateInvoice(userId: string, invoiceId: string): Promise<InvoiceDetail> {
  const business = await getBusinessSnapshot(userId)

  const newId = await transaction(async (tx) => {
    const source = await tx.query<{ invoice_number: string }>(
      'SELECT invoice_number FROM invoices WHERE user_id = $1 AND id = $2 AND archived_at IS NULL',
      [userId, invoiceId],
    )
    if (!source.rows[0]) throw new NotFoundError('That invoice could not be found.')

    const invoiceNumber = await resolveInvoiceNumber(tx, userId, '')

    const created = await tx.query<{ id: string }>(
      `INSERT INTO invoices (
         user_id, client_id, invoice_number, issue_date, due_date, status, currency,
         subtotal, discount_type, discount_value, discount_amount,
         tax_rate, tax_amount, total, notes, business_snapshot
       )
       SELECT user_id, client_id, $3, CURRENT_DATE, CURRENT_DATE + (due_date - issue_date), 'draft', currency,
              subtotal, discount_type, discount_value, discount_amount,
              tax_rate, tax_amount, total, notes, $4::jsonb
         FROM invoices
        WHERE user_id = $1 AND id = $2
       RETURNING id`,
      [userId, invoiceId, invoiceNumber, JSON.stringify(business)],
    )
    const id = created.rows[0]!.id

    await tx.query(
      `INSERT INTO invoice_items (invoice_id, description, detail, quantity, rate, amount, position)
       SELECT $2, description, detail, quantity, rate, amount, position
         FROM invoice_items
        WHERE invoice_id = $1`,
      [invoiceId, id],
    )

    await addEvent(tx, id, 'created', { invoiceNumber, duplicatedFrom: source.rows[0].invoice_number })
    await addEvent(tx, invoiceId, 'duplicated', { newInvoiceId: id, newInvoiceNumber: invoiceNumber })
    return id
  })

  return getInvoiceOrThrow(userId, newId)
}
export interface SendOutcome {
  token: string
  firstSend: boolean
  invoiceNumber: string
  total: number
  currency: string
}

/**
 * Marks an invoice sent and guarantees it has a share token, so "send by email"
 * and "copy link" are the same underlying capability. Re-sending keeps the
 * original `sent_at` — the timeline records each send separately.
 */
export async function markInvoiceSent(
  userId: string,
  invoiceId: string,
  meta: { to: string; subject?: string; via?: 'email' | 'link' } = { to: '' },
): Promise<SendOutcome> {
  return transaction(async (tx) => {
    const current = await tx.query<{
      status: string
      public_token: string | null
      invoice_number: string
      total: string
      currency: string
      item_count: number
    }>(
      `SELECT i.status, i.public_token, i.invoice_number, i.total::text AS total, i.currency,
              (SELECT count(*) FROM invoice_items it WHERE it.invoice_id = i.id)::int AS item_count
         FROM invoices i
        WHERE i.user_id = $1 AND i.id = $2 AND i.archived_at IS NULL
        FOR UPDATE`,
      [userId, invoiceId],
    )
    const row = current.rows[0]
    if (!row) throw new NotFoundError('That invoice could not be found.')
    if (row.status === 'paid') {
      throw new InvoiceStateError('This invoice is already paid, so there is nothing to send.', { status: 'paid' })
    }
    if (int(row.item_count) === 0) {
      throw new InvoiceStateError('Add at least one line item before sending this invoice.', { status: row.status })
    }

    const token = row.public_token ?? generatePublicToken()
    const firstSend = row.status === 'draft'

    await tx.query(
      `UPDATE invoices
          SET status = 'sent',
              public_token = $3,
              sent_at = coalesce(sent_at, now())
        WHERE user_id = $1 AND id = $2`,
      [userId, invoiceId, token],
    )

    await addEvent(tx, invoiceId, 'sent', {
      to: meta.to,
      subject: meta.subject ?? '',
      via: meta.via ?? 'email',
      resend: !firstSend,
    })

    return {
      token,
      firstSend,
      invoiceNumber: row.invoice_number,
      total: money(row.total),
      currency: row.currency,
    }
  })
}
export interface ReminderOutcome {
  token: string
  reminderCount: number
  invoiceNumber: string
}

/** A reminder only makes sense for something outstanding, not a draft or a paid invoice. */
export async function recordReminder(userId: string, invoiceId: string): Promise<ReminderOutcome> {
  return transaction(async (tx) => {
    const current = await tx.query<{ status: string; public_token: string | null; invoice_number: string }>(
      `SELECT status, public_token, invoice_number
         FROM invoices
        WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
        FOR UPDATE`,
      [userId, invoiceId],
    )
    const row = current.rows[0]
    if (!row) throw new NotFoundError('That invoice could not be found.')
    if (row.status === 'draft') {
      throw new InvoiceStateError('Send this invoice before reminding your client about it.', { status: 'draft' })
    }
    if (row.status === 'paid') {
      throw new InvoiceStateError('This invoice is already paid — no reminder needed.', { status: 'paid' })
    }

    const token = row.public_token ?? generatePublicToken()
    const updated = await tx.query<{ reminder_count: number }>(
      `UPDATE invoices
          SET reminder_sent_at = now(), reminder_count = reminder_count + 1, public_token = $3
        WHERE user_id = $1 AND id = $2
       RETURNING reminder_count`,
      [userId, invoiceId, token],
    )
    const reminderCount = int(updated.rows[0]?.reminder_count, 1)
    await addEvent(tx, invoiceId, 'reminder_sent', { count: reminderCount })

    return { token, reminderCount, invoiceNumber: row.invoice_number }
  })
}

/**
 * Revoking sets the token to NULL, which makes the public URL 404 immediately —
 * the link is the credential, so there is nothing else to invalidate (SHR-04).
 * Regenerating issues a new one, breaking any link already shared.
 */
export async function setPublicLink(
  userId: string,
  invoiceId: string,
  action: 'create' | 'revoke' | 'regenerate',
): Promise<{ token: string | null }> {
  return transaction(async (tx) => {
    const current = await tx.query<{ public_token: string | null; status: string }>(
      `SELECT public_token, status
         FROM invoices
        WHERE user_id = $1 AND id = $2 AND archived_at IS NULL
        FOR UPDATE`,
      [userId, invoiceId],
    )
    const row = current.rows[0]
    if (!row) throw new NotFoundError('That invoice could not be found.')

    if (action === 'revoke') {
      await tx.query('UPDATE invoices SET public_token = NULL WHERE user_id = $1 AND id = $2', [userId, invoiceId])
      await addEvent(tx, invoiceId, 'link_revoked', {})
      return { token: null }
    }

    if (action === 'create' && row.public_token) {
      return { token: row.public_token }
    }

    const token = generatePublicToken()
    await tx.query('UPDATE invoices SET public_token = $3 WHERE user_id = $1 AND id = $2', [userId, invoiceId, token])
    if (action === 'regenerate') {
      await addEvent(tx, invoiceId, 'link_regenerated', {})
    }
    return { token }
  })
}
// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

const PAYMENT_ROW = `
  id, invoice_id, amount::text AS amount, currency, method, reference, status,
  card_last4, payer_note, paid_at, created_at
`

export interface SettleOptions {
  method: 'card' | 'bank_transfer' | 'manual'
  payerNote?: string
  cardLast4?: string | null
  idempotencyKey?: string | null
}

export interface SettleResult {
  payment: Payment
  /** True when this call found the invoice already settled and changed nothing. */
  alreadyPaid: boolean
}

async function findPaymentByKey(tx: Queryable, invoiceId: string, key: string): Promise<Payment | null> {
  const { rows } = await tx.query(
    `SELECT ${PAYMENT_ROW} FROM payments WHERE invoice_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [invoiceId, key],
  )
  return rows[0] ? mapPayment(rows[0]) : null
}

async function latestPayment(tx: Queryable, invoiceId: string): Promise<Payment | null> {
  const { rows } = await tx.query(
    `SELECT ${PAYMENT_ROW} FROM payments
      WHERE invoice_id = $1 AND status = 'succeeded'
      ORDER BY paid_at DESC LIMIT 1`,
    [invoiceId],
  )
  return rows[0] ? mapPayment(rows[0]) : null
}

/**
 * The paid transition: insert the payment and flip the invoice, in one
 * transaction, with the invoice row locked (PAY-04). Callers are responsible
 * for having established the caller's right to settle this invoice — an owner
 * session, or a valid public token.
 *
 * Idempotent on two levels: an `idempotencyKey` already seen returns the first
 * payment, and an invoice already paid returns its existing payment instead of
 * erroring, so a double-clicked Pay button shows a receipt rather than a
 * failure (PAY-03).
 */
export async function settleInvoiceInTx(
  tx: Queryable,
  invoiceId: string,
  options: SettleOptions,
): Promise<SettleResult> {
  const locked = await tx.query<{ status: string; total: string; currency: string }>(
    'SELECT status, total::text AS total, currency FROM invoices WHERE id = $1 FOR UPDATE',
    [invoiceId],
  )
  const invoice = locked.rows[0]
  if (!invoice) throw new NotFoundError('That invoice could not be found.')

  if (options.idempotencyKey) {
    const existing = await findPaymentByKey(tx, invoiceId, options.idempotencyKey)
    if (existing) return { payment: existing, alreadyPaid: true }
  }

  if (invoice.status === 'paid') {
    const existing = await latestPayment(tx, invoiceId)
    if (existing) return { payment: existing, alreadyPaid: true }
  }

  const amount = money(invoice.total)
  if (amount <= 0) {
    throw new InvoiceStateError('This invoice has nothing to pay.', { status: invoice.status })
  }
  const wasDraft = invoice.status === 'draft'

  // `ON CONFLICT DO NOTHING` rather than catching the error: a failed statement
  // aborts the whole Postgres transaction, so losing the race has to be a
  // non-error. Nothing inserted means a concurrent request with the same key
  // got there first, and its payment is the answer.
  const insertResult = await tx.query(
    `INSERT INTO payments (invoice_id, amount, currency, method, reference, status,
                           card_last4, payer_note, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, $7, $8)
     ON CONFLICT (invoice_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING ${PAYMENT_ROW}`,
    [
      invoiceId,
      toDecimal(amount),
      invoice.currency,
      options.method,
      generateReference('PAY'),
      options.cardLast4 ?? null,
      options.payerNote ?? '',
      options.idempotencyKey ?? null,
    ],
  )

  const payment = insertResult.rows[0] ? mapPayment(insertResult.rows[0]) : null
  if (!payment) {
    const existing = options.idempotencyKey ? await findPaymentByKey(tx, invoiceId, options.idempotencyKey) : null
    if (existing) return { payment: existing, alreadyPaid: true }
    throw new ConflictError('That payment could not be recorded. Please try again.')
  }

  await tx.query(
    `UPDATE invoices
        SET status = 'paid', paid_at = now(), sent_at = coalesce(sent_at, now())
      WHERE id = $1`,
    [invoiceId],
  )

  // Paying an invoice that was never formally sent still needs a coherent
  // timeline, so record the implicit send first.
  if (wasDraft) {
    await addEvent(tx, invoiceId, 'sent', { via: 'manual', implicit: true })
  }
  await addEvent(tx, invoiceId, 'payment_received', {
    method: payment.method,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
  })

  return { payment, alreadyPaid: false }
}

/** Owner action: "Mark as paid" on the invoice page. */
export async function recordPayment(
  userId: string,
  invoiceId: string,
  options: SettleOptions,
): Promise<SettleResult> {
  return transaction(async (tx) => {
    const owned = await tx.query<{ id: string }>('SELECT id FROM invoices WHERE user_id = $1 AND id = $2 AND archived_at IS NULL', [
      userId,
      invoiceId,
    ])
    if (!owned.rows[0]) throw new NotFoundError('That invoice could not be found.')
    return settleInvoiceInTx(tx, invoiceId, options)
  })
}

