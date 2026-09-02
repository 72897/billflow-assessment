/**
 * Invoice arithmetic and derived status.
 *
 * The order of operations (discount before tax) and the derived-overdue rule are
 * the two places where getting it wrong shows up on a real invoice, so both are
 * pinned down here with the numbers written out.
 */

import { describe, expect, it } from 'vitest'
import { calculateInvoice, discountLabel, lineItemAmount } from '@/lib/invoice/calc'
import {
  daysOverdue,
  daysUntilDue,
  deriveDisplayStatus,
  dueDescription,
  editPolicy,
  isOverdue,
  todayIsoDate,
} from '@/lib/invoice/status'

/** ₹25,000 × 2 as the calculator sees it. */
const item = (quantity: number, rate: number) => ({ quantityThousandths: quantity, rateMinor: rate })

describe('line items', () => {
  it('multiplies a fractional quantity without a floating-point tail', () => {
    expect(lineItemAmount(item(2000, 2_500_000))).toBe(5_000_000)
    expect(lineItemAmount(item(1500, 100_000))).toBe(150_000)
    expect(lineItemAmount(item(3500, 400_000))).toBe(1_400_000)
    // 0.1 × 3 in floats is 0.30000000000000004; here it is exact.
    expect(lineItemAmount(item(100, 30_000))).toBe(3_000)
  })

  it('rounds a half-paise result half-up', () => {
    // 1.005 × 1.00 = 1.005 -> 1.01
    expect(lineItemAmount(item(1005, 100))).toBe(101)
    expect(lineItemAmount(item(1004, 100))).toBe(100)
  })

  it('treats a missing or nonsensical quantity as nothing billed', () => {
    expect(lineItemAmount(item(0, 2_500_000))).toBe(0)
    expect(lineItemAmount(item(-2000, 2_500_000))).toBe(0)
    expect(lineItemAmount(item(2000, -100))).toBe(0)
    expect(lineItemAmount(item(Number.NaN, 100))).toBe(0)
  })
})

describe('calculateInvoice', () => {
  it('sums the lines, then taxes what is left after the discount', () => {
    const result = calculateInvoice({
      items: [item(2000, 2_500_000), item(1000, 1_000_000)],
      taxRateBasisPoints: 1800,
    })
    expect(result.itemAmounts).toEqual([5_000_000, 1_000_000])
    expect(result.subtotal).toBe(6_000_000)
    expect(result.discountAmount).toBe(0)
    expect(result.taxableAmount).toBe(6_000_000)
    expect(result.taxAmount).toBe(1_080_000)
    expect(result.total).toBe(7_080_000)
  })

  it('applies a percentage discount to the subtotal, before tax', () => {
    // 50,000 - 10% = 45,000; +18% = 53,100
    const result = calculateInvoice({
      items: [item(2000, 2_500_000)],
      discountType: 'percentage',
      discountValue: 1000,
      taxRateBasisPoints: 1800,
    })
    expect(result.discountAmount).toBe(500_000)
    expect(result.taxableAmount).toBe(4_500_000)
    expect(result.taxAmount).toBe(810_000)
    expect(result.total).toBe(5_310_000)
  })

  it('applies a fixed discount as an amount, not a rate', () => {
    const result = calculateInvoice({
      items: [item(2000, 2_500_000)],
      discountType: 'fixed',
      discountValue: 500_000,
      taxRateBasisPoints: 1800,
    })
    expect(result.discountAmount).toBe(500_000)
    expect(result.total).toBe(5_310_000)
  })

  it('never lets a discount push the invoice below zero', () => {
    const result = calculateInvoice({
      items: [item(1000, 100_000)],
      discountType: 'fixed',
      discountValue: 900_000,
      taxRateBasisPoints: 1800,
    })
    expect(result.discountAmount).toBe(100_000)
    expect(result.taxableAmount).toBe(0)
    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(0)
  })

  it('handles a 100% discount and a zero tax rate', () => {
    const free = calculateInvoice({
      items: [item(1000, 100_000)],
      discountType: 'percentage',
      discountValue: 10_000,
      taxRateBasisPoints: 1800,
    })
    expect(free.total).toBe(0)

    const untaxed = calculateInvoice({ items: [item(1000, 100_000)] })
    expect(untaxed.taxAmount).toBe(0)
    expect(untaxed.total).toBe(100_000)
  })

  it('is empty, not broken, with no line items', () => {
    const result = calculateInvoice({ items: [], taxRateBasisPoints: 1800 })
    expect(result).toMatchObject({ subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 })
  })

  it('rounds a fractional tax to the nearest paise', () => {
    // 333.33 × 18% = 59.9994 -> 60.00
    const result = calculateInvoice({ items: [item(1000, 33_333)], taxRateBasisPoints: 1800 })
    expect(result.taxAmount).toBe(6_000)
    expect(result.total).toBe(39_333)
  })

  it('adds up to the same total whichever way a 100-line invoice is built', () => {
    const many = Array.from({ length: 100 }, () => item(1000, 1_999))
    const result = calculateInvoice({ items: many, taxRateBasisPoints: 500 })
    expect(result.subtotal).toBe(199_900)
    expect(result.taxAmount).toBe(9_995)
    expect(result.total).toBe(209_895)
  })

  it('labels the discount row with the percentage the user chose', () => {
    expect(discountLabel('percentage', 1000)).toBe('Discount (10%)')
    expect(discountLabel('percentage', 1250)).toBe('Discount (12.5%)')
    expect(discountLabel('fixed', 500_000)).toBe('Discount')
    expect(discountLabel(null, 0)).toBe('Discount')
  })
})
describe('derived status', () => {
  const today = '2026-09-02'

  it('reports overdue without anyone having marked it', () => {
    expect(deriveDisplayStatus({ status: 'sent', dueDate: '2026-08-25', paidAt: null }, today)).toBe('overdue')
    expect(deriveDisplayStatus({ status: 'sent', dueDate: '2026-09-02', paidAt: null }, today)).toBe('sent')
    expect(deriveDisplayStatus({ status: 'sent', dueDate: '2026-09-30', paidAt: null }, today)).toBe('sent')
  })

  it('leaves drafts and paid invoices alone, however old', () => {
    expect(deriveDisplayStatus({ status: 'draft', dueDate: '2020-01-01', paidAt: null }, today)).toBe('draft')
    expect(deriveDisplayStatus({ status: 'paid', dueDate: '2020-01-01', paidAt: '2020-02-01' }, today)).toBe('paid')
  })

  it('is due, not overdue, on the due date itself', () => {
    expect(isOverdue({ status: 'sent', dueDate: today, paidAt: null }, today)).toBe(false)
    expect(isOverdue({ status: 'sent', dueDate: '2026-09-01', paidAt: null }, today)).toBe(true)
  })

  it('counts whole days in either direction', () => {
    expect(daysOverdue('2026-08-23', today)).toBe(10)
    // Still in the future, so the count runs negative.
    expect(daysOverdue('2026-09-10', today)).toBe(-8)
    expect(daysUntilDue('2026-09-09', today)).toBe(7)
    expect(daysUntilDue('2026-08-23', today)).toBe(-10)
  })

  it('describes the due date the way the list reads it', () => {
    expect(dueDescription({ status: 'sent', dueDate: today, paidAt: null }, today)).toMatch(/today/i)
    expect(dueDescription({ status: 'sent', dueDate: '2026-09-03', paidAt: null }, today)).toMatch(/tomorrow/i)
    expect(dueDescription({ status: 'sent', dueDate: '2026-08-23', paidAt: null }, today)).toMatch(/10 days/i)
    expect(dueDescription({ status: 'paid', dueDate: '2026-08-23', paidAt: '2026-08-24' }, today)).toMatch(/paid/i)
  })

  it('says which invoices may be edited', () => {
    expect(editPolicy('draft')).toBe('free')
    expect(editPolicy('sent')).toBe('confirm')
    expect(editPolicy('paid')).toBe('locked')
  })

  it('reads today in UTC, so it agrees with the date Postgres derives status from', () => {
    // `invoice_display_status()` compares `due_date` against `current_date`, which
    // is UTC on every Postgres this deploys to. Reading the TypeScript side in
    // local time instead would make an invoice that SQL calls overdue render a
    // "due today" caption for as long as the viewer is offset from UTC.
    expect(todayIsoDate(new Date('2026-09-02T23:30:00Z'))).toBe('2026-09-02')
    expect(todayIsoDate(new Date('2026-01-01T00:05:00Z'))).toBe('2026-01-01')
    // The instant, not the wall clock, decides: half an hour before UTC midnight
    // is still the earlier date however far ahead the machine's clock is set.
    expect(todayIsoDate(new Date('2026-09-02T23:30:00+05:30'))).toBe('2026-09-02')
    expect(todayIsoDate(new Date('2026-09-03T02:00:00+05:30'))).toBe('2026-09-02')
  })
})
