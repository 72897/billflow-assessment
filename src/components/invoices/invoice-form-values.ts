/**
 * The invoice editor's form shape, and the two mappings around it.
 *
 * Every numeric field here is a **string**, deliberately. The validation schema
 * transforms `"1.5"` into `1500` thousandths and `"25000"` into `2500000` minor
 * units, and that transform must happen exactly once - on the server, which is
 * the only place whose arithmetic can be trusted. If the browser posted the
 * schema's *parsed* output instead, the server would re-scale numbers that were
 * already scaled and a quantity of 1.5 would arrive as 1,500. So the form keeps
 * raw strings from input to request, and the resolver runs in `raw` mode.
 */

import { todayIsoDate } from '@/lib/invoice/status'
import { DEFAULT_CURRENCY, formatQuantity, formatRate, MINOR_UNITS_PER_UNIT, toDecimal } from '@/lib/money'
import { addDaysToIsoDate } from '@/lib/utils'
import type { BusinessSettings, DiscountType, InvoiceDetail } from '@/types'

export interface LineItemValues {
  description: string
  detail: string
  quantity: string
  rate: string
}

/** One row of the client picker - exactly what `listClientOptions` returns. */
export interface ClientOption {
  id: string
  name: string
  company: string
  email: string
}

export interface InvoiceFormValues {
  clientId: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  currency: string
  items: LineItemValues[]
  discountType: DiscountType | null
  discountValue: string
  taxRate: string
  notes: string
}

export const EMPTY_LINE_ITEM: LineItemValues = { description: '', detail: '', quantity: '1', rate: '' }

/** Renders minor units for a text input: `2500000` -> `"25000"`, `1050` -> `"10.50"`. */
export function moneyInputValue(minor: number): string {
  if (!minor) return ''
  return minor % MINOR_UNITS_PER_UNIT === 0 ? String(minor / MINOR_UNITS_PER_UNIT) : toDecimal(minor)
}

function rateInputValue(basisPoints: number): string {
  return basisPoints ? formatRate(basisPoints) : ''
}

export interface DefaultsInput {
  settings: Pick<BusinessSettings, 'currency' | 'defaultTaxRate' | 'defaultNotes' | 'paymentTermsDays'>
  /** Peeked from `peek_invoice_number` - a suggestion, not a reservation. */
  nextInvoiceNumber: string
  /** From `?client=` on the new-invoice route. */
  presetClientId?: string
}

/** Blank invoice, pre-filled from the user's settings so most fields are already right. */
export function newInvoiceValues({ settings, nextInvoiceNumber, presetClientId }: DefaultsInput): InvoiceFormValues {
  const issueDate = todayIsoDate()
  return {
    clientId: presetClientId ?? '',
    invoiceNumber: nextInvoiceNumber,
    issueDate,
    dueDate: addDaysToIsoDate(issueDate, settings.paymentTermsDays),
    currency: settings.currency || DEFAULT_CURRENCY,
    items: [{ ...EMPTY_LINE_ITEM }],
    discountType: null,
    discountValue: '',
    taxRate: rateInputValue(settings.defaultTaxRate),
    notes: settings.defaultNotes ?? '',
  }
}

/** Existing invoice, unscaled back into the strings the inputs hold. */
export function invoiceToFormValues(invoice: InvoiceDetail): InvoiceFormValues {
  return {
    clientId: invoice.clientId,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    items: invoice.items.map((item) => ({
      description: item.description,
      detail: item.detail,
      quantity: formatQuantity(item.quantity),
      rate: moneyInputValue(item.rate),
    })),
    discountType: invoice.discountType,
    discountValue:
      invoice.discountType === 'percentage' ? rateInputValue(invoice.discountValue) : moneyInputValue(invoice.discountValue),
    taxRate: rateInputValue(invoice.taxRate),
    notes: invoice.notes,
  }
}

/**
 * Form values -> request body.
 *
 * Blank optional numbers are dropped rather than sent as `""`: the schema's
 * `.default(0)` fires on `undefined`, while an empty string would fail as "not a
 * number" and mark a field the user never touched.
 */
export function toInvoicePayload(
  values: InvoiceFormValues,
  extra: { intent?: 'draft' | 'send'; confirmSentEdit?: boolean } = {},
): Record<string, unknown> {
  return {
    clientId: values.clientId,
    invoiceNumber: values.invoiceNumber.trim(),
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    currency: values.currency,
    items: values.items.map((item) => ({
      description: item.description,
      detail: item.detail,
      quantity: item.quantity.trim() || '0',
      rate: item.rate.trim() || '0',
    })),
    discountType: values.discountType,
    discountValue: values.discountValue.trim() || undefined,
    taxRate: values.taxRate.trim() || undefined,
    notes: values.notes,
    ...extra,
  }
}
