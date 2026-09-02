import { isUniqueViolation, query, queryOne, transaction } from '@/lib/db'
import { ConflictError, NotFoundError } from '@/lib/errors'
import type { ClientInput, ClientListQuery } from '@/lib/validation/client'
import type { Client, ClientWithFinancials, Paginated } from '@/types'
import { int, mapClient, mapFinancials } from './mappers'
import { totalFor } from './paging'

const CLIENT_COLUMNS = `
  c.id, c.user_id, c.name, c.company, c.email, c.phone, c.address, c.notes,
  c.archived_at, c.created_at, c.updated_at
`

const FINANCIAL_COLUMNS = `
  coalesce(f.invoice_count, 0)::int              AS invoice_count,
  coalesce(f.total_billed, 0)::text              AS total_billed,
  coalesce(f.total_paid, 0)::text                AS total_paid,
  coalesce(f.total_outstanding, 0)::text         AS total_outstanding,
  coalesce(f.paid_count, 0)::int                 AS paid_count,
  coalesce(f.outstanding_count, 0)::int          AS outstanding_count,
  coalesce(f.overdue_count, 0)::int              AS overdue_count
`

const CLIENT_FROM = `
  FROM clients c
  LEFT JOIN client_financials f ON f.client_id = c.id
`

/** Escapes the wildcards a user might type so search stays a literal match. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}

const SORT_SQL: Record<ClientListQuery['sort'], string> = {
  name_asc: 'lower(c.name) ASC, c.created_at DESC',
  name_desc: 'lower(c.name) DESC, c.created_at DESC',
  newest: 'c.created_at DESC',
  oldest: 'c.created_at ASC',
  billed_desc: 'coalesce(f.total_billed, 0) DESC, lower(c.name) ASC',
}

function withFinancials(row: Record<string, unknown>): ClientWithFinancials {
  return { ...mapClient(row), financials: mapFinancials(row) }
}

/**
 * Server-side search, sort and pagination. `count(*) OVER ()` returns the
 * unpaginated total in the same round trip, so the footer ("Showing 1 to 10 of
 * 24") never needs a second query.
 */
export async function listClients(userId: string, params: ClientListQuery): Promise<Paginated<ClientWithFinancials>> {
  const values: unknown[] = [userId]
  const where: string[] = ['c.user_id = $1']

  if (!params.includeArchived) {
    where.push('c.archived_at IS NULL')
  }

  if (params.q) {
    values.push(likePattern(params.q))
    const index = values.length
    where.push(`(c.name ILIKE $${index} OR c.company ILIKE $${index} OR c.email ILIKE $${index})`)
  }

  const offset = (params.page - 1) * params.perPage
  values.push(params.perPage, offset)

  const { rows } = await query(
    `SELECT ${CLIENT_COLUMNS}, ${FINANCIAL_COLUMNS}, count(*) OVER ()::int AS total_rows
     ${CLIENT_FROM}
      WHERE ${where.join(' AND ')}
      ORDER BY ${SORT_SQL[params.sort]}
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  const total = await totalFor(CLIENT_FROM, where, values.slice(0, -2), rows, params.page)
  return {
    rows: rows.map(withFinancials),
    page: params.page,
    perPage: params.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.perPage)),
  }
}

/** Lightweight list for the client picker on the invoice editor. */
export async function listClientOptions(
  userId: string,
): Promise<Array<{ id: string; name: string; company: string; email: string }>> {
  const { rows } = await query<{ id: string; name: string; company: string; email: string }>(
    `SELECT id, name, company, email
       FROM clients
      WHERE user_id = $1 AND archived_at IS NULL
      ORDER BY lower(name) ASC`,
    [userId],
  )
  return rows
}

export async function countClients(userId: string): Promise<number> {
  const row = await queryOne<{ total: number }>(
    'SELECT count(*)::int AS total FROM clients WHERE user_id = $1 AND archived_at IS NULL',
    [userId],
  )
  return int(row?.total)
}

/**
 * Ownership is part of the WHERE clause, not a check afterwards: another user's
 * id simply produces no row, so the endpoint answers 404 and leaks nothing
 * about whether that id exists (CL-09).
 */
export async function findClient(userId: string, clientId: string): Promise<ClientWithFinancials | null> {
  const row = await queryOne(
    `SELECT ${CLIENT_COLUMNS}, ${FINANCIAL_COLUMNS}
       FROM clients c
       LEFT JOIN client_financials f ON f.client_id = c.id
      WHERE c.user_id = $1 AND c.id = $2
      LIMIT 1`,
    [userId, clientId],
  )
  return row ? withFinancials(row) : null
}

export async function getClientOrThrow(userId: string, clientId: string): Promise<ClientWithFinancials> {
  const client = await findClient(userId, clientId)
  if (!client) throw new NotFoundError('That client could not be found.')
  return client
}

/**
 * What the repository needs in order to write a client. Only the name is
 * required: the form always sends the rest as empty strings, but a caller that
 * builds the object by hand — a seed script, a test — should not have to.
 */
export type ClientWriteInput = Pick<ClientInput, 'name'> & Partial<Omit<ClientInput, 'name'>>

/**
 * The optional half of a client record, in column order. Every one of these
 * columns is NOT NULL with an empty-string default in the form, so a caller that
 * built the object by hand cannot trip a constraint.
 */
function optionalFields(input: ClientWriteInput): string[] {
  return [input.company ?? '', input.email ?? '', input.phone ?? '', input.address ?? '', input.notes ?? '']
}

export async function createClient(userId: string, input: ClientWriteInput): Promise<Client> {
  const { rows } = await query(
    `INSERT INTO clients (user_id, name, company, email, phone, address, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CLIENT_COLUMNS.replace(/c\./g, '')}`,
    [userId, input.name, ...optionalFields(input)],
  )
  return mapClient(rows[0]!)
}

export async function updateClient(userId: string, clientId: string, input: ClientWriteInput): Promise<Client> {
  const { rows } = await query(
    `UPDATE clients
        SET name = $3, company = $4, email = $5, phone = $6, address = $7, notes = $8
      WHERE user_id = $1 AND id = $2
      RETURNING ${CLIENT_COLUMNS.replace(/c\./g, '')}`,
    [userId, clientId, input.name, ...optionalFields(input)],
  )
  if (!rows[0]) throw new NotFoundError('That client could not be found.')
  return mapClient(rows[0])
}

export interface DeleteClientResult {
  outcome: 'deleted' | 'archived'
  invoiceCount: number
}

/**
 * A client with no invoices is deleted outright. A client that has been
 * invoiced is archived instead: hard-deleting would either destroy paid invoice
 * history or be blocked by the FK, and neither is a good answer for the user
 * (CL-08). Archived clients stay off the list and out of the picker, but their
 * invoices keep rendering correctly.
 */
export async function deleteClient(userId: string, clientId: string, force = false): Promise<DeleteClientResult> {
  return transaction(async (tx) => {
    const owned = await tx.query<{ id: string }>('SELECT id FROM clients WHERE user_id = $1 AND id = $2', [
      userId,
      clientId,
    ])
    if (!owned.rows[0]) throw new NotFoundError('That client could not be found.')

    const counted = await tx.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM invoices WHERE user_id = $1 AND client_id = $2',
      [userId, clientId],
    )
    const invoiceCount = int(counted.rows[0]?.total)

    if (invoiceCount === 0) {
      await tx.query('DELETE FROM clients WHERE user_id = $1 AND id = $2', [userId, clientId])
      return { outcome: 'deleted' as const, invoiceCount }
    }

    if (!force) {
      throw new ConflictError(
        `This client has ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}. ` +
          'Archiving keeps that history intact while removing them from your active list.',
        { client: ['Client has invoices'] },
      )
    }

    await tx.query('UPDATE clients SET archived_at = now() WHERE user_id = $1 AND id = $2 AND archived_at IS NULL', [
      userId,
      clientId,
    ])
    return { outcome: 'archived' as const, invoiceCount }
  })
}

export async function restoreClient(userId: string, clientId: string): Promise<Client> {
  const { rows } = await query(
    `UPDATE clients SET archived_at = NULL
      WHERE user_id = $1 AND id = $2
      RETURNING ${CLIENT_COLUMNS.replace(/c\./g, '')}`,
    [userId, clientId],
  )
  if (!rows[0]) throw new NotFoundError('That client could not be found.')
  return mapClient(rows[0])
}

export function assertNotDuplicateEmail(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError('A client with those details already exists.')
  }
  throw error
}
