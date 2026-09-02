/**
 * Zod schemas.
 *
 * These run on both sides of the wire: the form uses them for inline errors, the
 * route handler re-runs them on whatever actually arrives. The tests below are
 * the second case - a hand-rolled request, not the form.
 */

import { describe, expect, it } from 'vitest'
import { clientSchema } from '@/lib/validation/client'
import {
  createInvoiceSchema,
  invoiceListQuerySchema,
  paymentSchema,
  sendInvoiceSchema,
  updateInvoiceSchema,
} from '@/lib/validation/invoice'
import { loginSchema, signupSchema } from '@/lib/validation/auth'
import { settingsSchema } from '@/lib/validation/settings'

const CLIENT_ID = '0b3f5c1e-9d2a-4f18-9d3c-5e6a7b8c9d01'

function invoicePayload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    invoiceNumber: 'INV-0001',
    issueDate: '2026-09-02',
    dueDate: '2026-09-16',
    currency: 'INR',
    items: [{ description: 'Website design', quantity: '2', rate: '25000' }],
    discountType: null,
    discountValue: '0',
    taxRate: '18',
    notes: '',
    ...overrides,
  }
}

describe('invoice schema', () => {
  it('turns the form strings into the integers the server works in', () => {
    const parsed = createInvoiceSchema.parse(invoicePayload())
    expect(parsed.items[0]!.quantity).toBe(2000)
    expect(parsed.items[0]!.rate).toBe(2_500_000)
    expect(parsed.taxRate).toBe(1800)
    expect(parsed.discountValue).toBe(0)
    expect(parsed.intent).toBe('draft')
  })

  it('requires at least one line item and caps the list at 100', () => {
    expect(() => createInvoiceSchema.parse(invoicePayload({ items: [] }))).toThrow(/at least one line item/i)
    const hundred = Array.from({ length: 100 }, () => ({ description: 'Hour', quantity: '1', rate: '1000' }))
    expect(createInvoiceSchema.parse(invoicePayload({ items: hundred })).items).toHaveLength(100)
    expect(() => createInvoiceSchema.parse(invoicePayload({ items: [...hundred, hundred[0]!] }))).toThrow(/at most 100/i)
  })

  it('rejects a line item with no description or a zero quantity', () => {
    expect(() =>
      createInvoiceSchema.parse(invoicePayload({ items: [{ description: '   ', quantity: '1', rate: '100' }] })),
    ).toThrow(/description/i)
    expect(() =>
      createInvoiceSchema.parse(invoicePayload({ items: [{ description: 'Hour', quantity: '0', rate: '100' }] })),
    ).toThrow(/quantity/i)
    expect(() =>
      createInvoiceSchema.parse(invoicePayload({ items: [{ description: 'Hour', quantity: '-2', rate: '100' }] })),
    ).toThrow(/quantity/i)
    expect(() =>
      createInvoiceSchema.parse(invoicePayload({ items: [{ description: 'Hour', quantity: '1', rate: 'free' }] })),
    ).toThrow(/rate/i)
  })

  it('will not accept a due date before the issue date', () => {
    expect(() => createInvoiceSchema.parse(invoicePayload({ dueDate: '2026-09-01' }))).toThrow(
      /before the issue date/i,
    )
    // Same day is fine - due on receipt.
    expect(createInvoiceSchema.parse(invoicePayload({ dueDate: '2026-09-02' })).dueDate).toBe('2026-09-02')
  })

  it('guards the discount fields against contradictions', () => {
    expect(() =>
      createInvoiceSchema.parse(invoicePayload({ discountType: 'percentage', discountValue: '101' })),
    ).toThrow(/cannot exceed 100%/i)
    expect(() => createInvoiceSchema.parse(invoicePayload({ discountType: null, discountValue: '500' }))).toThrow(
      /discount type/i,
    )
    expect(createInvoiceSchema.parse(invoicePayload({ discountType: 'fixed', discountValue: '5000' })).discountValue)
      .toBe(500_000)
  })

  it('reads a blank discount and tax as none, and still rejects a blank rate', () => {
    // What the form actually holds on an invoice with no discount and no tax:
    // cleared boxes are '', which is not `undefined`, so `.default()` never sees
    // them. The browser validates these same schemas against the raw values, so
    // treating '' as an omission is what lets such an invoice be saved.
    const parsed = createInvoiceSchema.parse(invoicePayload({ discountValue: '', taxRate: '   ' }))
    expect(parsed.discountValue).toBe(0)
    expect(parsed.taxRate).toBe(0)
    expect(parsed.discountType).toBeNull()

    // A line item is a different matter: a price left empty is unfinished work,
    // not a price of nothing.
    expect(() =>
      createInvoiceSchema.parse(invoicePayload({ items: [{ description: 'Hour', quantity: '1', rate: '' }] })),
    ).toThrow(/rate/i)
  })

  it('checks the invoice number is a number a filing system can hold', () => {
    expect(createInvoiceSchema.parse(invoicePayload({ invoiceNumber: 'LUMEN/2026/07' })).invoiceNumber)
      .toBe('LUMEN/2026/07')
    expect(() => createInvoiceSchema.parse(invoicePayload({ invoiceNumber: '' }))).toThrow(/required/i)
    expect(() => createInvoiceSchema.parse(invoicePayload({ invoiceNumber: 'INV 0001!' }))).toThrow(/letters, numbers/i)
    expect(() => createInvoiceSchema.parse(invoicePayload({ invoiceNumber: '-nope' }))).toThrow(/letters, numbers/i)
  })

  it('rejects a client id that is not a uuid, and a currency it does not support', () => {
    expect(() => createInvoiceSchema.parse(invoicePayload({ clientId: 'client-1' }))).toThrow()
    expect(() => createInvoiceSchema.parse(invoicePayload({ currency: 'XYZ' }))).toThrow()
  })

  it('trims and defaults on the way through', () => {
    const parsed = createInvoiceSchema.parse(
      invoicePayload({ invoiceNumber: '  INV-0007  ', notes: '  Pay by NEFT.  ' }),
    )
    expect(parsed.invoiceNumber).toBe('INV-0007')
    expect(parsed.notes).toBe('Pay by NEFT.')
    expect(updateInvoiceSchema.parse(invoicePayload()).confirmSentEdit).toBe(false)
  })

  it('rejects a date that looks like one but is not', () => {
    expect(() => createInvoiceSchema.parse(invoicePayload({ issueDate: '2026-02-30' }))).toThrow(/valid date/i)
    expect(() => createInvoiceSchema.parse(invoicePayload({ issueDate: '02-09-2026' }))).toThrow(/YYYY-MM-DD/i)
  })
})
describe('list query schema', () => {
  it('fills in sensible defaults for a bare request', () => {
    expect(invoiceListQuerySchema.parse({})).toMatchObject({ status: 'all', sort: 'newest', page: 1, perPage: 10 })
  })

  it('coerces page numbers from the query string and falls back on nonsense', () => {
    expect(invoiceListQuerySchema.parse({ page: '3', perPage: '25' })).toMatchObject({ page: 3, perPage: 25 })
    expect(invoiceListQuerySchema.parse({ page: 'abc' }).page).toBe(1)
    expect(invoiceListQuerySchema.parse({ page: '0' }).page).toBe(1)
    expect(invoiceListQuerySchema.parse({ perPage: '5000' }).perPage).toBe(10)
  })

  it('drops a malformed client id or date instead of rejecting the whole request', () => {
    expect(invoiceListQuerySchema.parse({ client: 'not-a-uuid' }).client).toBeUndefined()
    expect(invoiceListQuerySchema.parse({ from: 'last week' }).from).toBeUndefined()
  })

  it('rejects a status or sort it does not know', () => {
    expect(() => invoiceListQuerySchema.parse({ status: 'cancelled' })).toThrow()
    expect(() => invoiceListQuerySchema.parse({ sort: 'client_name; DROP TABLE invoices' })).toThrow()
  })
})

describe('send, payment, client, auth and settings schemas', () => {
  it('needs a real email address to send to', () => {
    expect(sendInvoiceSchema.parse({ to: ' priya@lumen.test ', subject: 'Invoice INV-0001' }).to)
      .toBe('priya@lumen.test')
    expect(() => sendInvoiceSchema.parse({ to: 'priya', subject: 'Invoice' })).toThrow(/valid email/i)
    expect(() => sendInvoiceSchema.parse({ to: 'priya@lumen.test', subject: '' })).toThrow(/subject/i)
  })

  it('insists on an idempotency key for a payment', () => {
    expect(() => paymentSchema.parse({ method: 'card' })).toThrow()
    expect(() => paymentSchema.parse({ method: 'card', idempotencyKey: 'short' })).toThrow()
    expect(paymentSchema.parse({ method: 'card', idempotencyKey: 'pay-abc-12345678' }).method).toBe('card')
    expect(() => paymentSchema.parse({ method: 'crypto', idempotencyKey: 'pay-abc-12345678' })).toThrow()
  })

  it('requires a client name and a valid email if one is given', () => {
    expect(clientSchema.parse({ name: ' Priya Sharma ' }).name).toBe('Priya Sharma')
    expect(() => clientSchema.parse({ name: '' })).toThrow(/name/i)
    expect(() => clientSchema.parse({ name: 'Priya', email: 'priya at lumen' })).toThrow(/email/i)
    // Email is optional - a walk-in client may only have a phone number.
    expect(clientSchema.parse({ name: 'Priya', email: '' }).email).toBe('')
  })

  it('holds the signup password to a minimum standard', () => {
    expect(() => signupSchema.parse({ fullName: 'Priya', email: 'priya@lumen.test', password: 'short' })).toThrow()
    expect(signupSchema.parse({ fullName: ' Priya ', email: ' PRIYA@Lumen.test ', password: 'Password123' }))
      .toMatchObject({ fullName: 'Priya', email: 'priya@lumen.test' })
    expect(loginSchema.parse({ email: 'PRIYA@lumen.test', password: 'Password123' }).email).toBe('priya@lumen.test')
  })

  it('keeps settings within what an invoice can render', () => {
    const parsed = settingsSchema.parse({
      businessName: 'Lumen Studio',
      businessEmail: 'hello@lumen.test',
      currency: 'INR',
      invoicePrefix: ' inv ',
      nextInvoiceNumber: '42',
      defaultTaxRate: '18',
      paymentTermsDays: '14',
    })
    expect(parsed.invoicePrefix).toBe('INV')
    expect(parsed.nextInvoiceNumber).toBe(42)
    expect(parsed.defaultTaxRate).toBe(1800)
    expect(parsed.paymentTermsDays).toBe(14)

    const base = { currency: 'INR', invoicePrefix: 'INV', nextInvoiceNumber: '1' }
    // The letterhead cannot be blank, and a prefix has to be filing-safe.
    expect(() => settingsSchema.parse({ ...base, businessName: '  ' })).toThrow(/business name/i)
    expect(() => settingsSchema.parse({ ...base, businessName: 'Lumen', invoicePrefix: 'IN V!' })).toThrow(
      /letters, numbers and dashes/i,
    )
    expect(() => settingsSchema.parse({ ...base, businessName: 'Lumen', defaultTaxRate: '120' })).toThrow(
      /cannot be more than/i,
    )
    expect(() => settingsSchema.parse({ ...base, businessName: 'Lumen', nextInvoiceNumber: '0' })).toThrow(
      /1 or higher/i,
    )
    expect(() => settingsSchema.parse({ ...base, businessName: 'Lumen', paymentTermsDays: '400' })).toThrow(/365/i)

    // "Leave blank if you do not charge tax", as the field's own hint puts it.
    expect(settingsSchema.parse({ ...base, businessName: 'Lumen', defaultTaxRate: '' }).defaultTaxRate).toBe(0)
  })
})
