import { beforeAll, describe, expect, it } from 'vitest'
import { makeUser, truncateAll, useTestDb } from '../helpers/db'
import { query } from '@/lib/db'
import { addDaysToIsoDate } from '@/lib/utils'
import { todayIsoDate } from '@/lib/invoice/status'
import { createInvoiceSchema, invoiceListQuerySchema, updateInvoiceSchema } from '@/lib/validation/invoice'
import { clientListQuerySchema } from '@/lib/validation/client'
import { createClient, listClients } from '@/lib/repositories/clients'
import {
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  findInvoiceDetail,
  isInvoiceNumberTaken,
  listInvoices,
  markInvoiceSent,
  recordPayment,
  recordReminder,
  setPublicLink,
  updateInvoice,
} from '@/lib/repositories/invoices'
import { findPublicInvoice, payPublicInvoice, recordPublicView } from '@/lib/repositories/public'
import { getDashboardData } from '@/lib/repositories/dashboard'
import { peekInvoiceNumber } from '@/lib/repositories/settings'

useTestDb()

const today = todayIsoDate()

interface RawItem {
  description: string
  detail?: string
  quantity: string
  rate: string
}

/** Builds an invoice payload the way the form would, then runs it through Zod. */
async function parseCreateFor(user: string, client: string, overrides: Record<string, unknown> = {}) {
  const invoiceNumber = (overrides.invoiceNumber as string | undefined) ?? (await peekInvoiceNumber(user))
  return createInvoiceSchema.parse({
    clientId: client,
    invoiceNumber,
    issueDate: today,
    dueDate: addDaysToIsoDate(today, 14),
    currency: 'INR',
    items: [
      { description: 'Website design', detail: 'Figma handoff', quantity: '2', rate: '25000' },
    ] satisfies RawItem[],
    discountType: null,
    discountValue: '0',
    taxRate: '18',
    notes: 'Thanks for your business.',
    intent: 'draft',
    ...overrides,
  })
}

function parseCreate(client: string, overrides: Record<string, unknown> = {}) {
  return parseCreateFor(userId, client, overrides)
}

/** The same payload shaped for `updateInvoice`. */
async function buildUpdate(client: string, invoiceNumber: string, overrides: Record<string, unknown> = {}) {
  return updateInvoiceSchema.parse({
    clientId: client,
    invoiceNumber,
    issueDate: today,
    dueDate: addDaysToIsoDate(today, 14),
    currency: 'INR',
    items: [{ description: 'Website design', quantity: '2', rate: '25000' }] satisfies RawItem[],
    discountType: null,
    discountValue: '0',
    taxRate: '18',
    notes: '',
    ...overrides,
  })
}

/** Query objects go through the same Zod schemas the route handlers use. */
function listQuery(overrides: Record<string, unknown> = {}) {
  return invoiceListQuerySchema.parse(overrides)
}

function clientQuery(overrides: Record<string, unknown> = {}) {
  return clientListQuerySchema.parse(overrides)
}

let userId = ''
let clientId = ''

beforeAll(async () => {
  await truncateAll()
  const user = await makeUser('owner')
  userId = user.id
  const client = await createClient(userId, {
    name: 'Priya Sharma',
    company: 'Lumen Studio',
    email: 'priya@lumen.test',
    phone: '+91 98000 11122',
    address: '4th Cross, Indiranagar, Bengaluru',
    notes: '',
  })
  clientId = client.id
})
describe('invoice lifecycle', () => {
  it('allocates the suggested number and computes totals on the server', async () => {
    const suggested = await peekInvoiceNumber(userId)
    expect(suggested).toBe('INV-0001')

    const invoice = await createInvoice(userId, await parseCreate(clientId))

    expect(invoice.invoiceNumber).toBe('INV-0001')
    expect(invoice.status).toBe('draft')
    expect(invoice.displayStatus).toBe('draft')
    expect(invoice.items).toHaveLength(1)
    expect(invoice.items[0]!.quantity).toBe(2000)
    expect(invoice.items[0]!.rate).toBe(2_500_000)
    expect(invoice.items[0]!.amount).toBe(5_000_000)
    // 50,000 + 18% = 59,000
    expect(invoice.subtotal).toBe(5_000_000)
    expect(invoice.taxRate).toBe(1800)
    expect(invoice.taxAmount).toBe(900_000)
    expect(invoice.total).toBe(5_900_000)
    expect(invoice.client.name).toBe('Priya Sharma')
    expect(invoice.events.map((event) => event.type)).toContain('created')

    // The counter moved on, so the next suggestion is a free number.
    expect(await peekInvoiceNumber(userId)).toBe('INV-0002')
  })

  it('applies a percentage discount before tax', async () => {
    const invoice = await createInvoice(
      userId,
      await parseCreate(clientId, { discountType: 'percentage', discountValue: '10' }),
    )
    // 50,000 - 10% = 45,000; +18% tax = 53,100
    expect(invoice.discountValue).toBe(1000)
    expect(invoice.discountAmount).toBe(500_000)
    expect(invoice.taxAmount).toBe(810_000)
    expect(invoice.total).toBe(5_310_000)
  })

  it('recalculates from the items and ignores client-supplied totals', async () => {
    const created = await createInvoice(userId, await parseCreate(clientId))
    const updated = await updateInvoice(
      userId,
      created.id,
      updateInvoiceSchema.parse({
        clientId,
        invoiceNumber: created.invoiceNumber,
        issueDate: today,
        dueDate: addDaysToIsoDate(today, 30),
        currency: 'INR',
        items: [
          { description: 'Website design', quantity: '1', rate: '25000' },
          { description: 'Copywriting', quantity: '3.5', rate: '4000' },
        ],
        discountType: 'fixed',
        discountValue: '5000',
        taxRate: '18',
        notes: '',
      }),
    )

    // 25,000 + 14,000 = 39,000 - 5,000 = 34,000; +18% = 40,120
    expect(updated.items).toHaveLength(2)
    expect(updated.items[1]!.quantity).toBe(3500)
    expect(updated.items[1]!.amount).toBe(1_400_000)
    expect(updated.subtotal).toBe(3_900_000)
    expect(updated.discountAmount).toBe(500_000)
    expect(updated.taxAmount).toBe(612_000)
    expect(updated.total).toBe(4_012_000)
    expect(updated.dueDate).toBe(addDaysToIsoDate(today, 30))
  })
})
describe('sending, sharing and payment', () => {
  it('marks an invoice sent, mints a share token and records the send', async () => {
    const invoice = await createInvoice(userId, await parseCreate(clientId))
    const outcome = await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test', subject: 'Invoice' })

    expect(outcome.firstSend).toBe(true)
    expect(outcome.token).toMatch(/^[A-Za-z0-9_-]{16,}$/)

    const after = await findInvoiceDetail(userId, invoice.id)
    expect(after?.status).toBe('sent')
    expect(after?.displayStatus).toBe('sent')
    expect(after?.sentAt).toBeTruthy()
    expect(after?.hasPublicLink).toBe(true)
    expect(after?.events.map((event) => event.type)).toContain('sent')

    // Re-sending keeps the first sent_at and logs a second send.
    const resend = await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test' })
    expect(resend.firstSend).toBe(false)
    expect(resend.token).toBe(outcome.token)
    const resent = await findInvoiceDetail(userId, invoice.id)
    expect(resent?.sentAt).toBe(after?.sentAt)
    expect(resent?.events.filter((event) => event.type === 'sent')).toHaveLength(2)
  })

  it('serves a narrow public projection and counts views once per window', async () => {
    const invoice = await createInvoice(userId, await parseCreate(clientId))
    const { token } = await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test' })

    const seen = await findPublicInvoice(token)
    expect(seen?.invoiceNumber).toBe(invoice.invoiceNumber)
    expect(seen?.total).toBe(5_900_000)
    expect(seen?.client.name).toBe('Priya Sharma')
    expect(seen?.items).toHaveLength(1)
    expect(seen?.payment).toBeNull()
    // Nothing internal leaks through the public payload.
    expect(Object.keys(seen ?? {})).not.toContain('id')
    expect(Object.keys(seen ?? {})).not.toContain('userId')

    await recordPublicView(token)
    await recordPublicView(token)

    const viewed = await findInvoiceDetail(userId, invoice.id)
    expect(viewed?.viewCount).toBe(1)
    expect(viewed?.firstViewedAt).toBeTruthy()
    expect(viewed?.events.filter((event) => event.type === 'viewed')).toHaveLength(1)
  })

  it('pays once even when the button is double-clicked', async () => {
    const invoice = await createInvoice(userId, await parseCreate(clientId))
    const { token } = await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test' })

    const first = await payPublicInvoice(token, {
      method: 'card',
      idempotencyKey: 'idem-double-click-1',
      expectedTotal: String(invoice.total),
    })
    const second = await payPublicInvoice(token, {
      method: 'card',
      idempotencyKey: 'idem-double-click-1',
      expectedTotal: String(invoice.total),
    })

    expect(first.alreadyPaid).toBe(false)
    expect(second.alreadyPaid).toBe(true)
    expect(second.payment.reference).toBe(first.payment.reference)
    expect(first.payment.amount).toBe(5_900_000)
    expect(first.payment.cardLast4).toBe('4242')

    const paid = await findInvoiceDetail(userId, invoice.id)
    expect(paid?.status).toBe('paid')
    expect(paid?.displayStatus).toBe('paid')
    expect(paid?.paidAt).toBeTruthy()
    expect(paid?.payments).toHaveLength(1)
    expect(paid?.events.filter((event) => event.type === 'payment_received')).toHaveLength(1)
  })

  it('rejects a payment for a total the payer was not shown', async () => {
    const invoice = await createInvoice(userId, await parseCreate(clientId))
    const { token } = await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test' })

    await expect(
      payPublicInvoice(token, { method: 'card', idempotencyKey: 'idem-stale-total', expectedTotal: '1' }),
    ).rejects.toThrow(/changed while you were paying/i)
  })

  it('revoking a link makes it 404 immediately', async () => {
    const invoice = await createInvoice(userId, await parseCreate(clientId))
    const { token } = await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test' })
    expect(await findPublicInvoice(token)).not.toBeNull()

    await setPublicLink(userId, invoice.id, 'revoke')
    expect(await findPublicInvoice(token)).toBeNull()

    const { token: fresh } = await setPublicLink(userId, invoice.id, 'regenerate')
    expect(fresh).not.toBe(token)
    expect(await findPublicInvoice(fresh!)).not.toBeNull()
    expect(await findPublicInvoice(token)).toBeNull()
  })

  it('reminds only on outstanding invoices', async () => {
    const draft = await createInvoice(userId, await parseCreate(clientId))
    await expect(recordReminder(userId, draft.id)).rejects.toThrow(/before reminding/i)

    const { token } = await markInvoiceSent(userId, draft.id, { to: 'priya@lumen.test' })
    const reminder = await recordReminder(userId, draft.id)
    expect(reminder.reminderCount).toBe(1)
    expect(reminder.token).toBe(token)

    await recordPayment(userId, draft.id, { method: 'manual' })
    await expect(recordReminder(userId, draft.id)).rejects.toThrow(/already paid/i)
  })
})
describe('duplicating and deleting', () => {
  it('duplicates into a fresh draft with a new number and the same items', async () => {
    const source = await createInvoice(userId, await parseCreate(clientId))
    await markInvoiceSent(userId, source.id, { to: 'priya@lumen.test' })

    const copy = await duplicateInvoice(userId, source.id)

    expect(copy.id).not.toBe(source.id)
    expect(copy.invoiceNumber).not.toBe(source.invoiceNumber)
    expect(copy.status).toBe('draft')
    expect(copy.sentAt).toBeNull()
    expect(copy.hasPublicLink).toBe(false)
    expect(copy.payments).toHaveLength(0)
    expect(copy.total).toBe(source.total)
    expect(copy.items.map((item) => item.description)).toEqual(source.items.map((item) => item.description))
    // Today's date, keeping the original gap to the due date.
    expect(copy.issueDate).toBe(today)
    expect(copy.dueDate).toBe(addDaysToIsoDate(today, 14))

    const original = await findInvoiceDetail(userId, source.id)
    expect(original?.events.map((event) => event.type)).toContain('duplicated')
  })

  it('deletes a draft, needs confirmation for a sent one, and archives a paid one', async () => {
    const draft = await createInvoice(userId, await parseCreate(clientId))
    expect(await deleteInvoice(userId, draft.id)).toEqual({ outcome: 'deleted' })
    expect(await findInvoiceDetail(userId, draft.id)).toBeNull()

    const sent = await createInvoice(userId, await parseCreate(clientId))
    await markInvoiceSent(userId, sent.id, { to: 'priya@lumen.test' })
    await expect(deleteInvoice(userId, sent.id)).rejects.toThrow(/already been sent/i)
    expect(await deleteInvoice(userId, sent.id, true)).toEqual({ outcome: 'deleted' })

    const paid = await createInvoice(userId, await parseCreate(clientId))
    await recordPayment(userId, paid.id, { method: 'manual' })
    expect(await deleteInvoice(userId, paid.id)).toEqual({ outcome: 'archived' })
    // Archived invoices drop out of reads but the payment row survives.
    expect(await findInvoiceDetail(userId, paid.id)).toBeNull()
  })
})
describe('tenant isolation', () => {
  it('hides one account’s invoices and clients from another', async () => {
    const stranger = await makeUser('stranger')
    const mine = await createInvoice(userId, await parseCreate(clientId))

    expect(await findInvoiceDetail(stranger.id, mine.id)).toBeNull()
    await expect(markInvoiceSent(stranger.id, mine.id, { to: 'x@y.test' })).rejects.toThrow(/could not be found/i)
    await expect(updateInvoice(stranger.id, mine.id, await buildUpdate(clientId, mine.invoiceNumber))).rejects.toThrow(
      /could not be found/i,
    )
    await expect(deleteInvoice(stranger.id, mine.id)).rejects.toThrow(/could not be found/i)
    await expect(recordPayment(stranger.id, mine.id, { method: 'manual' })).rejects.toThrow(/could not be found/i)

    const strangerList = await listInvoices(stranger.id, listQuery())
    expect(strangerList.total).toBe(0)
    expect((await listClients(stranger.id, clientQuery())).total).toBe(0)

    // Numbering is per account, so the stranger also starts at INV-0001.
    expect(await peekInvoiceNumber(stranger.id)).toBe('INV-0001')
  })
})
describe('server-side search, filter, sort and pagination', () => {
  let ownerId = ''
  let lumen = ''
  let atlas = ''

  beforeAll(async () => {
    const owner = await makeUser('lister')
    ownerId = owner.id
    lumen = (await createClient(ownerId, { name: 'Priya Sharma', company: 'Lumen Studio', email: 'priya@lumen.test', phone: '', address: '', notes: '' })).id
    atlas = (await createClient(ownerId, { name: 'Rahul Verma', company: 'Atlas Foods', email: 'rahul@atlas.test', phone: '', address: '', notes: '' })).id

    // One of each state, with distinct amounts so sorting is unambiguous.
    const shapes = [
      { client: lumen, rate: '10000', issue: today, due: addDaysToIsoDate(today, 14) }, // draft
      { client: lumen, rate: '20000', issue: today, due: addDaysToIsoDate(today, 3) }, // sent, due this week
      { client: atlas, rate: '30000', issue: addDaysToIsoDate(today, -35), due: addDaysToIsoDate(today, -5) }, // overdue
      { client: atlas, rate: '40000', issue: today, due: addDaysToIsoDate(today, 14) }, // paid
    ]
    const made = []
    for (const shape of shapes) {
      made.push(
        await createInvoice(
          ownerId,
          await parseCreateFor(ownerId, shape.client, {
            issueDate: shape.issue,
            dueDate: shape.due,
            items: [{ description: 'Retainer', quantity: '1', rate: shape.rate }],
          }),
        ),
      )
    }
    await markInvoiceSent(ownerId, made[1]!.id, { to: 'priya@lumen.test' })
    await markInvoiceSent(ownerId, made[2]!.id, { to: 'rahul@atlas.test' })
    await recordPayment(ownerId, made[3]!.id, { method: 'manual' })
  })

  it('derives overdue without anyone marking it', async () => {
    const overdue = await listInvoices(ownerId, listQuery({ status: 'overdue' }))
    expect(overdue.total).toBe(1)
    expect(overdue.rows[0]!.status).toBe('sent')
    expect(overdue.rows[0]!.displayStatus).toBe('overdue')
    expect(overdue.rows[0]!.total).toBe(3_540_000)

    // An overdue invoice is no longer "sent" for filtering purposes.
    const sent = await listInvoices(ownerId, listQuery({ status: 'sent' }))
    expect(sent.total).toBe(1)
    expect(sent.rows[0]!.displayStatus).toBe('sent')

    expect((await listInvoices(ownerId, listQuery({ status: 'draft' }))).total).toBe(1)
    expect((await listInvoices(ownerId, listQuery({ status: 'paid' }))).total).toBe(1)
    expect((await listInvoices(ownerId, listQuery({ status: 'all' }))).total).toBe(4)
  })

  it('searches invoice numbers and client details in SQL', async () => {
    expect((await listInvoices(ownerId, listQuery({ q: 'atlas' }))).total).toBe(2)
    expect((await listInvoices(ownerId, listQuery({ q: 'PRIYA' }))).total).toBe(2)
    expect((await listInvoices(ownerId, listQuery({ q: 'rahul@atlas.test' }))).total).toBe(2)
    expect((await listInvoices(ownerId, listQuery({ q: 'INV-0001' }))).total).toBe(1)
    expect((await listInvoices(ownerId, listQuery({ q: 'nobody' }))).total).toBe(0)
    // A typed wildcard is matched literally, not treated as "everything".
    expect((await listInvoices(ownerId, listQuery({ q: '%' }))).total).toBe(0)
  })

  it('combines a client filter with a status filter', async () => {
    const atlasOnly = await listInvoices(ownerId, listQuery({ client: atlas }))
    expect(atlasOnly.total).toBe(2)
    expect(atlasOnly.rows.every((row) => row.clientCompany === 'Atlas Foods')).toBe(true)

    const atlasPaid = await listInvoices(ownerId, listQuery({ client: atlas, status: 'paid' }))
    expect(atlasPaid.total).toBe(1)
    expect((await listInvoices(ownerId, listQuery({ client: lumen, status: 'paid' }))).total).toBe(0)
  })

  it('sorts and paginates in the database', async () => {
    const byAmount = await listInvoices(ownerId, listQuery({ sort: 'amount_desc' }))
    expect(byAmount.rows.map((row) => row.total)).toEqual([4_720_000, 3_540_000, 2_360_000, 1_180_000])

    const cheapestFirst = await listInvoices(ownerId, listQuery({ sort: 'amount_asc' }))
    expect(cheapestFirst.rows[0]!.total).toBe(1_180_000)

    const byNumber = await listInvoices(ownerId, listQuery({ sort: 'number_asc' }))
    expect(byNumber.rows.map((row) => row.invoiceNumber)).toEqual(['INV-0001', 'INV-0002', 'INV-0003', 'INV-0004'])

    const firstPage = await listInvoices(ownerId, listQuery({ sort: 'number_asc', page: 1, perPage: 3 }))
    expect(firstPage.rows).toHaveLength(3)
    expect(firstPage.total).toBe(4)
    expect(firstPage.totalPages).toBe(2)

    const secondPage = await listInvoices(ownerId, listQuery({ sort: 'number_asc', page: 2, perPage: 3 }))
    expect(secondPage.rows.map((row) => row.invoiceNumber)).toEqual(['INV-0004'])
    expect(secondPage.page).toBe(2)

    // Past the end is an empty page, not an error.
    const beyond = await listInvoices(ownerId, listQuery({ page: 9, perPage: 3 }))
    expect(beyond.rows).toHaveLength(0)
    expect(beyond.total).toBe(4)
  })

  it('filters by issue-date range', async () => {
    // Three were issued today; the overdue one was issued 35 days ago.
    expect((await listInvoices(ownerId, listQuery({ from: today, to: today }))).total).toBe(3)
    expect((await listInvoices(ownerId, listQuery({ to: addDaysToIsoDate(today, -1) }))).total).toBe(1)
    expect((await listInvoices(ownerId, listQuery({ from: addDaysToIsoDate(today, -40), to: today }))).total).toBe(4)
    expect((await listInvoices(ownerId, listQuery({ from: addDaysToIsoDate(today, 1) }))).total).toBe(0)
  })

  it('rolls the same numbers up into the dashboard', async () => {
    const dashboard = await getDashboardData(ownerId)
    const { stats } = dashboard

    expect(stats.invoiceCount).toBe(4)
    expect(stats.draftCount).toBe(1)
    expect(stats.sentCount).toBe(2) // stored status, overdue included
    expect(stats.paidCount).toBe(1)
    expect(stats.clientCount).toBe(2)
    expect(stats.totalEarned).toBe(4_720_000)
    expect(stats.totalEarnedThisMonth).toBe(4_720_000)
    // Overdue money is still outstanding money.
    expect(stats.outstanding).toBe(2_360_000 + 3_540_000)
    expect(stats.outstandingCount).toBe(2)
    expect(stats.overdue).toBe(3_540_000)
    expect(stats.overdueCount).toBe(1)
    expect(stats.currency).toBe('INR')

    // The overdue invoice and the one due this week both need attention.
    expect(dashboard.needsAttention).toHaveLength(2)
    expect(dashboard.needsAttention[0]!.displayStatus).toBe('overdue')
    expect(dashboard.needsAttention[0]!.daysOverdue).toBe(5)
    expect(dashboard.needsAttention[0]!.hasPublicLink).toBe(true)

    expect(dashboard.recentInvoices).toHaveLength(4)

    // Gap-free buckets: the default window is a rolling 30 days, with today
    // carrying the payment.
    const todayPoint = dashboard.income.points.find((point) => point.date === today)
    expect(dashboard.income.granularity).toBe('day')
    expect(dashboard.income.points.length).toBe(30)
    expect(todayPoint?.amount).toBe(4_720_000)
    expect(dashboard.income.total).toBe(4_720_000)

    // The calendar month is still one of the ranges on offer: one point per day
    // elapsed, so on the 9th it is nine buckets wide.
    const monthly = await getDashboardData(ownerId, 'this_month')
    expect(monthly.income.granularity).toBe('day')
    expect(monthly.income.points.length).toBe(Number(today.slice(8, 10)))
    expect(monthly.income.total).toBe(4_720_000)

    const yearly = await getDashboardData(ownerId, 'last_12_months')
    expect(yearly.income.granularity).toBe('month')
    expect(yearly.income.points).toHaveLength(12)
    expect(yearly.income.total).toBe(4_720_000)
  })
})
describe('drafts, edits and guards', () => {
  it('refuses to edit a paid invoice and asks before editing a sent one', async () => {
    const invoice = await createInvoice(userId, await parseCreate(clientId))
    await markInvoiceSent(userId, invoice.id, { to: 'priya@lumen.test' })

    // A sent invoice is in the client's hands, so the edit needs acknowledging.
    await expect(updateInvoice(userId, invoice.id, await buildUpdate(clientId, invoice.invoiceNumber))).rejects.toThrow(
      /already been sent/i,
    )
    const edited = await updateInvoice(
      userId,
      invoice.id,
      await buildUpdate(clientId, invoice.invoiceNumber, { confirmSentEdit: true, taxRate: '0' }),
    )
    expect(edited.taxAmount).toBe(0)
    expect(edited.total).toBe(5_000_000)
    expect(edited.status).toBe('sent')

    await recordPayment(userId, invoice.id, { method: 'manual' })
    await expect(
      updateInvoice(userId, invoice.id, await buildUpdate(clientId, invoice.invoiceNumber, { confirmSentEdit: true })),
    ).rejects.toThrow(/paid/i)
  })

  it('rejects a duplicate invoice number with a field error', async () => {
    const first = await createInvoice(userId, await parseCreate(clientId))
    await expect(
      createInvoice(userId, await parseCreate(clientId, { invoiceNumber: first.invoiceNumber })),
    ).rejects.toMatchObject({ fieldErrors: { invoiceNumber: expect.any(Array) } })

    expect(await isInvoiceNumberTaken(userId, first.invoiceNumber)).toBe(true)
    expect(await isInvoiceNumberTaken(userId, first.invoiceNumber, first.id)).toBe(false)
    expect(await isInvoiceNumberTaken(userId, 'INV-9999')).toBe(false)
  })

  it('keeps a manually typed number and leaves the counter alone', async () => {
    const suggested = await peekInvoiceNumber(userId)
    const custom = await createInvoice(userId, await parseCreate(clientId, { invoiceNumber: 'LUMEN/2026/07' }))

    expect(custom.invoiceNumber).toBe('LUMEN/2026/07')
    // The suggestion was never consumed, so it is still on offer.
    expect(await peekInvoiceNumber(userId)).toBe(suggested)
  })

  it('will not send an invoice with no line items', async () => {
    const empty = await createInvoice(userId, await parseCreate(clientId))
    await query('DELETE FROM invoice_items WHERE invoice_id = $1', [empty.id])
    await expect(markInvoiceSent(userId, empty.id, { to: 'priya@lumen.test' })).rejects.toThrow(
      /at least one line item/i,
    )
  })
})
