/**
 * Invoice arithmetic — the one implementation used by both the browser (for
 * instant feedback while typing) and the server (which recalculates every
 * amount from scratch before writing, so a tampered request cannot change a
 * total). Everything is integer arithmetic on minor units / thousandths /
 * basis points.
 *
 * Order of operations, fixed:
 *   item_amount = quantity * rate
 *   subtotal    = sum(item_amount)
 *   discount    = percentage of subtotal, or a fixed amount capped at subtotal
 *   taxable     = subtotal - discount
 *   tax         = taxable * tax_rate
 *   total       = taxable + tax
 */

export type DiscountType = 'percentage' | 'fixed'

export interface CalcLineItem {
  /** Quantity in thousandths: 1.5 -> 1500. */
  quantityThousandths: number
  /** Rate in minor units: ₹25,000.00 -> 2500000. */
  rateMinor: number
}

export interface CalcInput {
  items: readonly CalcLineItem[]
  discountType?: DiscountType | null
  /** Basis points when percentage (10% -> 1000); minor units when fixed. */
  discountValue?: number
  /** Tax rate in basis points: 18% -> 1800. */
  taxRateBasisPoints?: number
}

export interface CalcResult {
  /** Per-item amount in minor units, index-aligned with the input. */
  itemAmounts: number[]
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  total: number
}

/** Rounds half-up, and away from zero for negatives, on a rational quotient. */
function divideRound(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  const sign = numerator < 0 ? -1 : 1
  return sign * Math.round(Math.abs(numerator) / denominator)
}

export function lineItemAmount(item: CalcLineItem): number {
  const quantity = Number.isFinite(item.quantityThousandths) ? item.quantityThousandths : 0
  const rate = Number.isFinite(item.rateMinor) ? item.rateMinor : 0
  if (quantity <= 0 || rate < 0) return 0
  // quantity is x1000, rate is already minor units -> divide the 1000 back out.
  return divideRound(quantity * rate, 1000)
}

export function calculateInvoice(input: CalcInput): CalcResult {
  const itemAmounts = input.items.map(lineItemAmount)
  const subtotal = itemAmounts.reduce((sum, amount) => sum + amount, 0)

  let discountAmount = 0
  const discountValue = Number.isFinite(input.discountValue) ? (input.discountValue as number) : 0

  if (input.discountType === 'percentage' && discountValue > 0) {
    // basis points: 1000 bp = 10% -> subtotal * 1000 / 10000
    discountAmount = divideRound(subtotal * discountValue, 10_000)
  } else if (input.discountType === 'fixed' && discountValue > 0) {
    discountAmount = discountValue
  }

  // A discount can never push the taxable amount below zero (INV-05).
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal))

  const taxableAmount = subtotal - discountAmount

  const taxRate = Number.isFinite(input.taxRateBasisPoints) ? (input.taxRateBasisPoints as number) : 0
  const taxAmount = taxRate > 0 ? divideRound(taxableAmount * taxRate, 10_000) : 0

  return {
    itemAmounts,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    total: taxableAmount + taxAmount,
  }
}

/** Human label for the discount row: "Discount (10%)" or "Discount". */
export function discountLabel(discountType: DiscountType | null | undefined, discountValue: number): string {
  if (discountType === 'percentage' && discountValue > 0) {
    const percent = discountValue / 100
    const text = Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)))
    return `Discount (${text}%)`
  }
  return 'Discount'
}
