/**
 * Business settings, and the invoice numbering that lives with them.
 *
 * Settings are the part of the app that changes what an invoice looks like, so
 * the tests here are mostly about reach: a new prefix must show up in the next
 * number, a new currency in the next invoice — and neither may rewrite an
 * invoice that has already gone out (SET-06). Numbering gets its own suite
 * because two invoices created at the same moment must never collide (INV-10).
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { makeUser, truncateAll, useTestDb } from '../helpers/db'
import { query, transaction } from '@/lib/db'
import { addDaysToIsoDate } from '@/lib/utils'
import { todayIsoDate } from '@/lib/invoice/status'
import {
  LOGO_MAX_BYTES,
  dataUrlByteLength,
  logoUploadSchema,
  settingsSchema,
  type SettingsInput,
} from '@/lib/validation/settings'
import { createInvoiceSchema } from '@/lib/validation/invoice'
import {
  createDefaultSettings,
  getBusinessSnapshot,
  getSettings,
  peekInvoiceNumber,
  updateLogoUrl,
  updateSettings,
} from '@/lib/repositories/settings'
import { createClient } from '@/lib/repositories/clients'
import { createInvoice, findInvoiceDetail } from '@/lib/repositories/invoices'

useTestDb()

const today = todayIsoDate()

beforeAll(async () => {
  await truncateAll()
})

/** The settings form, filled in the way a real business would fill it. */
function settingsPayload(overrides: Record<string, unknown> = {}): SettingsInput {
  return settingsSchema.parse({
    businessName: 'Lumen Studio',
    businessEmail: 'billing@lumen.test',
    phone: '+91 98200 11223',
    address: '4th Floor, Bandra West, Mumbai 400050',
    taxId: '27AAAPL1234C1ZV',
    currency: 'INR',
    invoicePrefix: 'INV',
    nextInvoiceNumber: '1',
    defaultTaxRate: '18',
    defaultNotes: 'Payment within 14 days.',
    paymentTermsDays: '14',
    ...overrides,
  })
}

/** Creates an invoice, letting the database allocate its number. */
async function makeInvoice(owner: string, client: string, overrides: Record<string, unknown> = {}) {
  const input = createInvoiceSchema.parse({
    clientId: client,
    invoiceNumber: await peekInvoiceNumber(owner),
    issueDate: today,
    dueDate: addDaysToIsoDate(today, 14),
    currency: 'INR',
    items: [{ description: 'Retainer', quantity: '1', rate: '10000' }],
    discountType: null,
    discountValue: '0',
    taxRate: '0',
    notes: '',
    ...overrides,
  })
  return createInvoice(owner, input)
}

describe('reading and writing settings', () => {
  it('saves the whole form and reads every field back', async () => {
    const user = await makeUser('settings')
    const saved = await updateSettings(user.id, settingsPayload())

    expect(saved).toMatchObject({
      businessName: 'Lumen Studio',
      businessEmail: 'billing@lumen.test',
      phone: '+91 98200 11223',
      taxId: '27AAAPL1234C1ZV',
      currency: 'INR',
      invoicePrefix: 'INV',
      nextInvoiceNumber: 1,
      defaultNotes: 'Payment within 14 days.',
      paymentTermsDays: 14,
    })
    // A rate is basis points in TypeScript and numeric(7,4)-ish in the column;
    // it has to survive the round trip exactly, not as 17.999999.
    expect(saved.defaultTaxRate).toBe(1800)

    const reread = await getSettings(user.id)
    expect(reread).toEqual(saved)
  })

  it('keeps a decimal tax rate exact', async () => {
    const user = await makeUser('settings-rate')
    const saved = await updateSettings(user.id, settingsPayload({ defaultTaxRate: '12.5' }))
    expect(saved.defaultTaxRate).toBe(1250)

    const { rows } = await query<{ rate: string }>(
      'SELECT default_tax_rate::text AS rate FROM business_settings WHERE user_id = $1',
      [user.id],
    )
    expect(Number(rows[0]!.rate)).toBe(12.5) // stored as numeric, not a float
    expect((await getSettings(user.id)).defaultTaxRate).toBe(1250)
  })

  it('creates the row on demand if it is somehow missing', async () => {
    const user = await makeUser('settings-missing')
    await query('DELETE FROM business_settings WHERE user_id = $1', [user.id])

    const recreated = await getSettings(user.id)
    expect(recreated.userId).toBe(user.id)
    expect(recreated.invoicePrefix).toBe('INV')
    expect(recreated.nextInvoiceNumber).toBe(1)

    // And updating still works from that state, rather than throwing.
    await query('DELETE FROM business_settings WHERE user_id = $1', [user.id])
    const saved = await updateSettings(user.id, settingsPayload({ businessName: 'Recovered Co' }))
    expect(saved.businessName).toBe('Recovered Co')
  })

  it('does not create a second row for an account that has one', async () => {
    const user = await makeUser('settings-once')
    await updateSettings(user.id, settingsPayload({ businessName: 'Original' }))
    await createDefaultSettings({ query }, user.id, { businessName: 'Should not overwrite' })

    const { rows } = await query('SELECT id FROM business_settings WHERE user_id = $1', [user.id])
    expect(rows).toHaveLength(1)
    expect((await getSettings(user.id)).businessName).toBe('Original')
  })

  it('keeps one business’s settings out of another’s', async () => {
    const first = await makeUser('settings-a')
    const second = await makeUser('settings-b')
    await updateSettings(first.id, settingsPayload({ businessName: 'First Studio', invoicePrefix: 'FS' }))
    await updateSettings(second.id, settingsPayload({ businessName: 'Second Studio', invoicePrefix: 'SS' }))

    expect((await getSettings(first.id)).invoicePrefix).toBe('FS')
    expect((await getSettings(second.id)).invoicePrefix).toBe('SS')
  })
})

describe('the logo', () => {
  it('stores and clears the logo url', async () => {
    const user = await makeUser('logo')
    expect((await getSettings(user.id)).logoUrl).toBeNull()

    const withLogo = await updateLogoUrl(user.id, '/uploads/logo-abc.png')
    expect(withLogo.logoUrl).toBe('/uploads/logo-abc.png')
    expect((await getBusinessSnapshot(user.id)).logoUrl).toBe('/uploads/logo-abc.png')

    const cleared = await updateLogoUrl(user.id, null)
    expect(cleared.logoUrl).toBeNull()
  })

  it('accepts the image types an invoice can render, and refuses the rest', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(logoUploadSchema.parse({ dataUrl: png, fileName: 'logo.png' }).dataUrl).toBe(png)
    expect(() => logoUploadSchema.parse({ dataUrl: 'data:image/gif;base64,R0lGOD' })).toThrow(/PNG, JPG, WEBP or SVG/i)
    // A PDF or an executable renamed to .png would arrive with its own prefix.
    expect(() => logoUploadSchema.parse({ dataUrl: 'data:application/pdf;base64,JVBERi0=' })).toThrow(/PNG/i)
    expect(() => logoUploadSchema.parse({ dataUrl: 'https://example.test/logo.png' })).toThrow(/PNG/i)
    expect(() => logoUploadSchema.parse({ dataUrl: '' })).toThrow(/choose an image/i)
  })

  it('refuses an image larger than 2MB', async () => {
    // The request body is JSON, so the size limit cannot live in the file picker.
    expect(dataUrlByteLength('data:image/png;base64,')).toBe(0)
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).toBe(3)
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).toBe(2)

    const justUnder = `data:image/png;base64,${'A'.repeat(Math.floor((LOGO_MAX_BYTES * 4) / 3) - 8)}`
    expect(dataUrlByteLength(justUnder)).toBeLessThanOrEqual(LOGO_MAX_BYTES)
    expect(logoUploadSchema.parse({ dataUrl: justUnder }).dataUrl).toBe(justUnder)

    const tooBig = `data:image/png;base64,${'A'.repeat(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 8)}`
    expect(dataUrlByteLength(tooBig)).toBeGreaterThan(LOGO_MAX_BYTES)
    expect(() => logoUploadSchema.parse({ dataUrl: tooBig })).toThrow(/2MB or smaller/i)
  })
})

// ---------------------------------------------------------------------------
// Numbering. The counter lives on the settings row and is advanced by
// `allocate_invoice_number()`, which takes a row lock — so the interesting
// cases are a user-typed number creating a gap, and several invoices being
// created at once.
// ---------------------------------------------------------------------------

describe('invoice numbering', () => {
  it('previews the next number without consuming it', async () => {
    const user = await makeUser('numbering-peek')
    const client = await createClient(user.id, { name: 'Peek Co' })

    expect(await peekInvoiceNumber(user.id)).toBe('INV-0001')
    expect(await peekInvoiceNumber(user.id)).toBe('INV-0001') // still, twice over
    expect((await getSettings(user.id)).nextInvoiceNumber).toBe(1)

    const first = await makeInvoice(user.id, client.id)
    expect(first.invoiceNumber).toBe('INV-0001')
    expect(await peekInvoiceNumber(user.id)).toBe('INV-0002')
    expect((await getSettings(user.id)).nextInvoiceNumber).toBe(2)
  })

  it('picks up a new prefix and a new starting number', async () => {
    const user = await makeUser('numbering-prefix')
    const client = await createClient(user.id, { name: 'Prefix Co' })
    await makeInvoice(user.id, client.id) // INV-0001

    await updateSettings(user.id, settingsPayload({ invoicePrefix: 'lumen', nextInvoiceNumber: '42' }))
    expect((await getSettings(user.id)).invoicePrefix).toBe('LUMEN') // upper-cased by the schema
    expect(await peekInvoiceNumber(user.id)).toBe('LUMEN-0042')

    const next = await makeInvoice(user.id, client.id)
    expect(next.invoiceNumber).toBe('LUMEN-0042')
    expect((await getSettings(user.id)).nextInvoiceNumber).toBe(43)

    // The invoice numbered before the change keeps the number it was issued with.
    const { rows } = await query<{ invoice_number: string }>(
      'SELECT invoice_number FROM invoices WHERE user_id = $1 ORDER BY created_at',
      [user.id],
    )
    expect(rows.map((row) => row.invoice_number)).toEqual(['INV-0001', 'LUMEN-0042'])
  })

  it('skips a number that has already been used by hand', async () => {
    const user = await makeUser('numbering-gap')
    const client = await createClient(user.id, { name: 'Gap Co' })

    // The number field is editable, so a user can take INV-0002 early.
    await makeInvoice(user.id, client.id, { invoiceNumber: 'INV-0002' })
    // The counter has not moved: a typed number is not an allocation.
    expect((await getSettings(user.id)).nextInvoiceNumber).toBe(1)

    expect(await peekInvoiceNumber(user.id)).toBe('INV-0001')
    const first = await makeInvoice(user.id, client.id)
    expect(first.invoiceNumber).toBe('INV-0001')

    // INV-0002 is taken, so the next allocation steps over it.
    expect(await peekInvoiceNumber(user.id)).toBe('INV-0003')
    const third = await makeInvoice(user.id, client.id)
    expect(third.invoiceNumber).toBe('INV-0003')
    expect((await getSettings(user.id)).nextInvoiceNumber).toBe(4)
  })

  it('ignores case when deciding a number is taken', async () => {
    const user = await makeUser('numbering-case')
    const client = await createClient(user.id, { name: 'Case Co' })
    await makeInvoice(user.id, client.id, { invoiceNumber: 'inv-0001' })

    expect(await peekInvoiceNumber(user.id)).toBe('INV-0002')
    expect((await makeInvoice(user.id, client.id)).invoiceNumber).toBe('INV-0002')
  })

  it('gives every invoice its own number when several are created at once', async () => {
    const user = await makeUser('numbering-race')
    const client = await createClient(user.id, { name: 'Race Co' })

    // Under `pg` this is genuine concurrency and the FOR UPDATE row lock is what
    // keeps the numbers apart; under PGlite the driver serialises them. Either
    // way, ten allocations must produce ten different numbers and no gaps.
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () =>
        transaction(async (tx) => {
          const { rows } = await tx.query<{ number: string }>('SELECT allocate_invoice_number($1) AS number', [user.id])
          return rows[0]!.number
        }),
      ),
    )

    expect(new Set(numbers).size).toBe(10)
    expect([...numbers].sort()).toEqual([
      'INV-0001',
      'INV-0002',
      'INV-0003',
      'INV-0004',
      'INV-0005',
      'INV-0006',
      'INV-0007',
      'INV-0008',
      'INV-0009',
      'INV-0010',
    ])
    expect((await getSettings(user.id)).nextInvoiceNumber).toBe(11)
  })

  it('numbers each business separately', async () => {
    const first = await makeUser('numbering-tenant-a')
    const second = await makeUser('numbering-tenant-b')
    const firstClient = await createClient(first.id, { name: 'A' })
    const secondClient = await createClient(second.id, { name: 'B' })

    await makeInvoice(first.id, firstClient.id)
    await makeInvoice(first.id, firstClient.id)

    // The second business starts at 1 regardless of what the first has issued.
    expect((await makeInvoice(second.id, secondClient.id)).invoiceNumber).toBe('INV-0001')
    expect((await getSettings(first.id)).nextInvoiceNumber).toBe(3)
    expect((await getSettings(second.id)).nextInvoiceNumber).toBe(2)
  })
})

describe('what an invoice remembers', () => {
  it('freezes the letterhead onto the invoice, so an old one still reads right', async () => {
    const user = await makeUser('snapshot')
    const client = await createClient(user.id, { name: 'Snapshot Co' })
    await updateSettings(
      user.id,
      settingsPayload({ businessName: 'Lumen Studio', businessEmail: 'billing@lumen.test', taxId: 'GST-OLD' }),
    )
    await updateLogoUrl(user.id, '/uploads/old-logo.png')

    const invoice = await makeInvoice(user.id, client.id)
    expect(invoice.business).toMatchObject({
      businessName: 'Lumen Studio',
      businessEmail: 'billing@lumen.test',
      taxId: 'GST-OLD',
      logoUrl: '/uploads/old-logo.png',
    })

    // The business rebrands, moves, and changes its tax registration.
    await updateSettings(
      user.id,
      settingsPayload({ businessName: 'Lumen Collective', businessEmail: 'hello@lumen.co', taxId: 'GST-NEW' }),
    )
    await updateLogoUrl(user.id, '/uploads/new-logo.png')

    const reread = await findInvoiceDetail(user.id, invoice.id)
    expect(reread?.business).toMatchObject({
      businessName: 'Lumen Studio',
      taxId: 'GST-OLD',
      logoUrl: '/uploads/old-logo.png',
    })
    // A new invoice uses the new details.
    expect((await makeInvoice(user.id, client.id)).business.businessName).toBe('Lumen Collective')
  })

  it('falls back to current settings when an old invoice has no snapshot', async () => {
    const user = await makeUser('snapshot-missing')
    const client = await createClient(user.id, { name: 'Legacy Co' })
    const invoice = await makeInvoice(user.id, client.id)
    await updateSettings(user.id, settingsPayload({ businessName: 'Current Name' }))
    await query('UPDATE invoices SET business_snapshot = NULL WHERE id = $1', [invoice.id])

    // Nothing renders blank: the invoice page borrows today's letterhead.
    expect((await findInvoiceDetail(user.id, invoice.id))?.business.businessName).toBe('Current Name')
  })
})
