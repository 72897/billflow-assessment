/**
 * Clients.
 *
 * Two things carry most of the weight here. Deleting a client who has been
 * invoiced must not destroy invoice history, so the repository archives instead
 * (CL-08). And the money shown next to a client comes from a SQL view, not from
 * TypeScript adding numbers up — so the tests move invoices through their real
 * transitions and then read the rollup back.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { makeUser, truncateAll, useTestDb } from '../helpers/db'
import { query } from '@/lib/db'
import { addDaysToIsoDate } from '@/lib/utils'
import { todayIsoDate } from '@/lib/invoice/status'
import { clientListQuerySchema, clientSchema } from '@/lib/validation/client'
import { createInvoiceSchema } from '@/lib/validation/invoice'
import {
  countClients,
  createClient,
  deleteClient,
  findClient,
  getClientOrThrow,
  likePattern,
  listClientOptions,
  listClients,
  restoreClient,
  updateClient,
} from '@/lib/repositories/clients'
import { createInvoice, markInvoiceSent, recordPayment } from '@/lib/repositories/invoices'
import { peekInvoiceNumber } from '@/lib/repositories/settings'

useTestDb()

const today = todayIsoDate()

let userId = ''

beforeAll(async () => {
  await truncateAll()
  userId = (await makeUser('clients')).id
})

/** A client payload built the way the form builds it, through the same schema. */
function clientPayload(overrides: Record<string, unknown> = {}) {
  return clientSchema.parse({ name: 'Priya Sharma', ...overrides })
}

function clientQuery(overrides: Record<string, unknown> = {}) {
  return clientListQuerySchema.parse(overrides)
}

/** Creates an invoice for `client` and leaves it in the requested state. */
async function invoiceFor(
  owner: string,
  client: string,
  rate: string,
  state: 'draft' | 'sent' | 'paid' | 'overdue',
) {
  const issueDate = state === 'overdue' ? addDaysToIsoDate(today, -30) : today
  const dueDate = state === 'overdue' ? addDaysToIsoDate(today, -4) : addDaysToIsoDate(today, 14)
  const input = createInvoiceSchema.parse({
    clientId: client,
    invoiceNumber: await peekInvoiceNumber(owner),
    issueDate,
    dueDate,
    currency: 'INR',
    items: [{ description: 'Consulting', quantity: '1', rate }],
    discountType: null,
    discountValue: '0',
    taxRate: '0',
    notes: '',
  })
  const invoice = await createInvoice(owner, input)
  if (state !== 'draft') await markInvoiceSent(owner, invoice.id, { to: 'billing@example.test' })
  if (state === 'paid') await recordPayment(owner, invoice.id, { method: 'manual' })
  return invoice
}

describe('client records', () => {
  it('creates a client from the form payload and reads it back', async () => {
    const created = await createClient(
      userId,
      clientPayload({
        name: '  Lumen Studio  ',
        company: 'Lumen Design LLP',
        email: ' HELLO@Lumen.test ',
        phone: '+91 98200 11223',
        address: '4th Floor, Bandra West, Mumbai',
        notes: 'Prefers NEFT.',
      }),
    )

    expect(created.name).toBe('Lumen Studio') // trimmed by the schema
    // Trimmed but not lowered: unlike a login email this is a contact address
    // that gets printed on the invoice, so it keeps the casing it was typed in.
    expect(created.email).toBe('HELLO@Lumen.test')
    expect(created.archivedAt).toBeNull()

    const found = await findClient(userId, created.id)
    expect(found).toMatchObject({ id: created.id, company: 'Lumen Design LLP', notes: 'Prefers NEFT.' })
    // A brand-new client has been billed nothing at all.
    expect(found?.financials).toMatchObject({ invoiceCount: 0, totalBilled: 0, totalOutstanding: 0, overdueCount: 0 })
  })

  it('accepts a client who only has a phone number', async () => {
    const walkIn = await createClient(userId, clientPayload({ name: 'Walk-in', phone: '+91 90000 00000' }))
    expect(walkIn.email).toBe('')
    expect(walkIn.company).toBe('')
    // The columns are NOT NULL, so the empty strings have to have reached the row.
    const { rows } = await query<{ email: string; notes: string }>('SELECT email, notes FROM clients WHERE id = $1', [
      walkIn.id,
    ])
    expect(rows[0]).toEqual({ email: '', notes: '' })
  })

  it('edits a client in place, keeping its id and created date', async () => {
    const created = await createClient(userId, clientPayload({ name: 'Before', company: 'Old Co' }))
    const updated = await updateClient(
      userId,
      created.id,
      clientPayload({ name: 'After', company: 'New Co', email: 'after@studio.test' }),
    )

    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated).toMatchObject({ name: 'After', company: 'New Co', email: 'after@studio.test' })
    // Fields left out of the payload are cleared rather than silently kept.
    expect(updated.notes).toBe('')
  })

  it('404s for a client that does not exist, and for one that is not yours', async () => {
    const stranger = await makeUser('stranger')
    const theirs = await createClient(stranger.id, clientPayload({ name: 'Not yours' }))

    expect(await findClient(userId, theirs.id)).toBeNull()
    expect(await findClient(userId, '2f1c0a9b-7d6e-4f5a-8b3c-1d2e3f4a5b6c')).toBeNull()
    await expect(getClientOrThrow(userId, theirs.id)).rejects.toThrow(/could not be found/i)
    // The owner still sees it, so the 404 above is about ownership, not existence.
    expect(await findClient(stranger.id, theirs.id)).not.toBeNull()
  })

  it('counts only the active clients', async () => {
    const solo = await makeUser('counter')
    expect(await countClients(solo.id)).toBe(0)
    const first = await createClient(solo.id, clientPayload({ name: 'One' }))
    await createClient(solo.id, clientPayload({ name: 'Two' }))
    expect(await countClients(solo.id)).toBe(2)

    await invoiceFor(solo.id, first.id, '1000', 'sent')
    await deleteClient(solo.id, first.id, true) // archived, because it has an invoice
    expect(await countClients(solo.id)).toBe(1)
  })

  it('offers only active clients to the invoice editor, in name order', async () => {
    const owner = await makeUser('picker')
    const zeta = await createClient(owner.id, clientPayload({ name: 'zeta works' }))
    await createClient(owner.id, clientPayload({ name: 'Alpha Foods', company: 'Alpha', email: 'a@alpha.test' }))
    await createClient(owner.id, clientPayload({ name: 'Meridian' }))

    expect((await listClientOptions(owner.id)).map((option) => option.name)).toEqual([
      'Alpha Foods',
      'Meridian',
      'zeta works', // case-insensitive, so lowercase does not sort last
    ])

    await invoiceFor(owner.id, zeta.id, '1000', 'draft')
    await deleteClient(owner.id, zeta.id, true)
    expect((await listClientOptions(owner.id)).map((option) => option.name)).toEqual(['Alpha Foods', 'Meridian'])
  })
})

describe('deleting versus archiving', () => {
  it('deletes a client who has never been invoiced', async () => {
    const owner = await makeUser('deleter')
    const client = await createClient(owner.id, clientPayload({ name: 'Never invoiced' }))

    expect(await deleteClient(owner.id, client.id)).toEqual({ outcome: 'deleted', invoiceCount: 0 })
    expect(await findClient(owner.id, client.id)).toBeNull()
    const { rows } = await query('SELECT id FROM clients WHERE id = $1', [client.id])
    expect(rows).toHaveLength(0)
  })

  it('refuses to delete a client with invoices until the archive is confirmed', async () => {
    const owner = await makeUser('archiver')
    const client = await createClient(owner.id, clientPayload({ name: 'Has history' }))
    const invoice = await invoiceFor(owner.id, client.id, '12000', 'paid')

    await expect(deleteClient(owner.id, client.id)).rejects.toMatchObject({
      fieldErrors: { client: ['Client has invoices'] },
    })
    // Nothing happened: the refusal is not a partial delete.
    expect((await findClient(owner.id, client.id))?.archivedAt).toBeNull()

    expect(await deleteClient(owner.id, client.id, true)).toEqual({ outcome: 'archived', invoiceCount: 1 })

    // The invoice — and its payment — survive the client being removed.
    const kept = await query<{ status: string }>('SELECT status FROM invoices WHERE id = $1', [invoice.id])
    expect(kept.rows[0]?.status).toBe('paid')
    const payments = await query('SELECT id FROM payments WHERE invoice_id = $1', [invoice.id])
    expect(payments.rows).toHaveLength(1)
  })

  it('hides an archived client from the list but keeps it reachable', async () => {
    const owner = await makeUser('hidden')
    const client = await createClient(owner.id, clientPayload({ name: 'Archived Co' }))
    await invoiceFor(owner.id, client.id, '5000', 'sent')
    await deleteClient(owner.id, client.id, true)

    expect((await listClients(owner.id, clientQuery())).rows).toHaveLength(0)
    const withArchived = await listClients(owner.id, clientQuery({ includeArchived: '1' }))
    expect(withArchived.rows).toHaveLength(1)
    expect(withArchived.rows[0]!.archivedAt).not.toBeNull()
    // Still openable by id, so a link from an old invoice does not 404.
    expect(await findClient(owner.id, client.id)).not.toBeNull()

    const restored = await restoreClient(owner.id, client.id)
    expect(restored.archivedAt).toBeNull()
    expect((await listClients(owner.id, clientQuery())).rows).toHaveLength(1)
  })

  it('will not delete, archive or restore another user’s client', async () => {
    const owner = await makeUser('owner-a')
    const other = await makeUser('owner-b')
    const client = await createClient(owner.id, clientPayload({ name: 'Guarded' }))

    await expect(deleteClient(other.id, client.id)).rejects.toThrow(/could not be found/i)
    await expect(deleteClient(other.id, client.id, true)).rejects.toThrow(/could not be found/i)
    await expect(restoreClient(other.id, client.id)).rejects.toThrow(/could not be found/i)
    expect(await findClient(owner.id, client.id)).not.toBeNull()
  })
})

describe('billing rollups', () => {
  it('adds up what a client has been billed, paid and still owes', async () => {
    const owner = await makeUser('rollup')
    const client = await createClient(owner.id, clientPayload({ name: 'Rollup Co' }))

    await invoiceFor(owner.id, client.id, '10000', 'draft') // not billed yet
    await invoiceFor(owner.id, client.id, '20000', 'sent')
    await invoiceFor(owner.id, client.id, '30000', 'overdue')
    await invoiceFor(owner.id, client.id, '40000', 'paid')

    const financials = (await getClientOrThrow(owner.id, client.id)).financials

    expect(financials.invoiceCount).toBe(4)
    // A draft has not been issued, so it is not money owed to anyone.
    expect(financials.totalBilled).toBe(9_000_000)
    expect(financials.totalPaid).toBe(4_000_000)
    expect(financials.totalOutstanding).toBe(5_000_000)
    expect(financials.paidCount).toBe(1)
    expect(financials.outstandingCount).toBe(2)
    expect(financials.overdueCount).toBe(1) // derived from the due date, not stored
  })

  it('stops counting an invoice once it is deleted', async () => {
    const owner = await makeUser('rollup-archive')
    const client = await createClient(owner.id, clientPayload({ name: 'Shrinking Co' }))
    const sent = await invoiceFor(owner.id, client.id, '25000', 'sent')
    await invoiceFor(owner.id, client.id, '15000', 'sent')

    expect((await getClientOrThrow(owner.id, client.id)).financials.totalOutstanding).toBe(4_000_000)

    await query('UPDATE invoices SET archived_at = now() WHERE id = $1', [sent.id])
    const after = (await getClientOrThrow(owner.id, client.id)).financials
    expect(after.invoiceCount).toBe(1)
    expect(after.totalOutstanding).toBe(1_500_000)
  })

  it('keeps one user’s totals out of another’s', async () => {
    const first = await makeUser('tenant-1')
    const second = await makeUser('tenant-2')
    const mine = await createClient(first.id, clientPayload({ name: 'Same Name Ltd' }))
    const theirs = await createClient(second.id, clientPayload({ name: 'Same Name Ltd' }))

    await invoiceFor(first.id, mine.id, '11000', 'sent')
    await invoiceFor(second.id, theirs.id, '99000', 'sent')

    expect((await getClientOrThrow(first.id, mine.id)).financials.totalBilled).toBe(1_100_000)
    expect((await getClientOrThrow(second.id, theirs.id)).financials.totalBilled).toBe(9_900_000)
  })
})

// ---------------------------------------------------------------------------
// The list. Search, sort and pagination all happen in SQL — the assertions
// below are about what came back from Postgres, not about anything filtered
// afterwards in TypeScript.
// ---------------------------------------------------------------------------

describe('the client list', () => {
  let listerId = ''

  beforeAll(async () => {
    const lister = await makeUser('lister')
    listerId = lister.id

    const seeds = [
      { name: 'Atlas Foods', company: 'Atlas Trading Pvt Ltd', email: 'accounts@atlas.test', billed: '40000' },
      { name: 'Lumen Studio', company: 'Lumen Design LLP', email: 'hello@lumen.test', billed: '10000' },
      { name: 'meridian works', company: 'Meridian', email: 'ap@meridian.test', billed: '25000' },
      { name: 'Northwind Co', company: 'Northwind Pvt Ltd', email: 'pay@northwind.test', billed: null },
      { name: '50% Discount Traders', company: 'Fifty', email: 'hi@fifty.test', billed: null },
    ]

    for (const seed of seeds) {
      const client = await createClient(listerId, clientPayload(seed))
      if (seed.billed) await invoiceFor(listerId, client.id, seed.billed, 'sent')
    }
  })

  it('sorts by name, case-insensitively, and by newest', async () => {
    const byName = await listClients(listerId, clientQuery({ sort: 'name_asc' }))
    expect(byName.rows.map((row) => row.name)).toEqual([
      '50% Discount Traders',
      'Atlas Foods',
      'Lumen Studio',
      'meridian works',
      'Northwind Co',
    ])

    const descending = await listClients(listerId, clientQuery({ sort: 'name_desc' }))
    expect(descending.rows[0]!.name).toBe('Northwind Co')

    const newest = await listClients(listerId, clientQuery({ sort: 'newest' }))
    expect(newest.rows[0]!.name).toBe('50% Discount Traders')
    const oldest = await listClients(listerId, clientQuery({ sort: 'oldest' }))
    expect(oldest.rows[0]!.name).toBe('Atlas Foods')
  })

  it('sorts by how much a client has been billed', async () => {
    const byBilled = await listClients(listerId, clientQuery({ sort: 'billed_desc' }))
    expect(byBilled.rows.map((row) => row.name)).toEqual([
      'Atlas Foods', // 40,000
      'meridian works', // 25,000
      'Lumen Studio', // 10,000
      '50% Discount Traders', // nothing billed, so alphabetical from here
      'Northwind Co',
    ])
    expect(byBilled.rows[0]!.financials.totalBilled).toBe(4_000_000)
  })

  it('searches name, company and email in one query', async () => {
    expect((await listClients(listerId, clientQuery({ q: 'lumen' }))).rows.map((row) => row.name)).toEqual([
      'Lumen Studio',
    ])
    // Company only — 'Trading' appears in no name or email.
    expect((await listClients(listerId, clientQuery({ q: 'Trading' }))).rows.map((row) => row.name)).toEqual([
      'Atlas Foods',
    ])
    // Email only.
    expect((await listClients(listerId, clientQuery({ q: 'northwind.test' }))).rows.map((row) => row.name)).toEqual([
      'Northwind Co',
    ])
    // Partial, mid-word and mixed case.
    expect((await listClients(listerId, clientQuery({ q: 'ERIDIAN' }))).rows).toHaveLength(1)
    const nothing = await listClients(listerId, clientQuery({ q: 'nobody at all' }))
    expect(nothing.rows).toHaveLength(0)
    expect(nothing.total).toBe(0)
    expect(nothing.totalPages).toBe(1) // an empty list is still one (empty) page
  })

  it('treats a typed % or _ as a character, not a wildcard', async () => {
    expect(likePattern('50%')).toBe('%50\\%%')
    // Without escaping, '%' would match every client.
    expect((await listClients(listerId, clientQuery({ q: '50%' }))).rows.map((row) => row.name)).toEqual([
      '50% Discount Traders',
    ])
    expect((await listClients(listerId, clientQuery({ q: '_' }))).rows).toHaveLength(0)
  })

  it('pages through the list and reports the unpaginated total', async () => {
    const first = await listClients(listerId, clientQuery({ perPage: '2', page: '1' }))
    expect(first.rows).toHaveLength(2)
    expect(first).toMatchObject({ page: 1, perPage: 2, total: 5, totalPages: 3 })

    const last = await listClients(listerId, clientQuery({ perPage: '2', page: '3' }))
    expect(last.rows).toHaveLength(1)
    expect(last.total).toBe(5)

    // Past the end: no rows, but the footer still knows how many there are.
    const beyond = await listClients(listerId, clientQuery({ perPage: '2', page: '9' }))
    expect(beyond.rows).toHaveLength(0)
    expect(beyond).toMatchObject({ total: 5, totalPages: 3 })

    // Pages do not overlap.
    const pageOne = await listClients(listerId, clientQuery({ perPage: '2', page: '1', sort: 'name_asc' }))
    const pageTwo = await listClients(listerId, clientQuery({ perPage: '2', page: '2', sort: 'name_asc' }))
    const ids = [...pageOne.rows, ...pageTwo.rows].map((row) => row.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('counts the filtered total, not the whole table', async () => {
    // 'lumen' is in that client's name, company and email at once — the join
    // must not count it three times.
    expect((await listClients(listerId, clientQuery({ q: 'lumen' }))).total).toBe(1)

    // Two of the five are 'Pvt Ltd' companies, and the total says so even
    // though only one row fits on the page.
    const filtered = await listClients(listerId, clientQuery({ q: 'Pvt', perPage: '1' }))
    expect(filtered.rows).toHaveLength(1)
    expect(filtered).toMatchObject({ total: 2, totalPages: 2 })
  })

  it('shows nobody else’s clients, whatever the query asks for', async () => {
    const outsider = await makeUser('outsider')
    const everything = await listClients(outsider.id, clientQuery({ includeArchived: '1', perPage: '100' }))
    expect(everything.rows).toHaveLength(0)
    expect(everything.total).toBe(0)
  })
})
