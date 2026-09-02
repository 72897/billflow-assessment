import { z } from 'zod'
import { CURRENCY_CODES, DEFAULT_CURRENCY } from '@/lib/money'
import {
  MAX_LINE_AMOUNT_MINOR,
  decimalField,
  isoDateField,
  optionalText,
  requiredText,
  trimmed,
  uuidField,
} from './fields'

export const MAX_LINE_ITEMS = 100

export const invoiceNumberField = trimmed.pipe(
  z
    .string()
    .min(1, { message: 'Invoice number is required' })
    .max(40, { message: 'Invoice number must be 40 characters or fewer' })
    .regex(/^[A-Za-z0-9][A-Za-z0-9/_-]*$/, {
      message: 'Use letters, numbers, dashes, slashes and underscores only',
    }),
)

export const lineItemSchema = z.object({
  description: requiredText('Item description', 200),
  detail: optionalText('Item detail', 300),
  quantity: decimalField({ label: 'Quantity', scale: 3, exclusiveMin: 0, max: 999_999_999 }),
  rate: decimalField({ label: 'Rate', scale: 2, min: 0, max: MAX_LINE_AMOUNT_MINOR }),
})

const baseInvoiceShape = {
  clientId: uuidField,
  invoiceNumber: invoiceNumberField,
  issueDate: isoDateField,
  dueDate: isoDateField,
  currency: z.enum(CURRENCY_CODES as unknown as [string, ...string[]]).default(DEFAULT_CURRENCY),
  items: z
    .array(lineItemSchema)
    .min(1, { message: 'Add at least one line item' })
    .max(MAX_LINE_ITEMS, { message: `An invoice can hold at most ${MAX_LINE_ITEMS} line items` }),
  discountType: z.enum(['percentage', 'fixed']).nullish().default(null),
  discountValue: decimalField({ label: 'Discount', scale: 2, min: 0, max: MAX_LINE_AMOUNT_MINOR, blankAs: 0 }).default(0),
  taxRate: decimalField({ label: 'Tax rate', scale: 2, min: 0, max: 10_000, blankAs: 0 }).default(0),
  notes: optionalText('Notes', 2000),
}

/** Cross-field rules shared by create and update. */
function refineInvoice<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .superRefine((value: z.infer<typeof schema>, ctx) => {
      if (value.dueDate < value.issueDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dueDate'],
          message: 'Due date cannot be before the issue date',
        })
      }
      if (value.discountType === 'percentage' && value.discountValue > 10_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountValue'],
          message: 'A percentage discount cannot exceed 100%',
        })
      }
      if (value.discountType === null && value.discountValue > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountType'],
          message: 'Choose a discount type',
        })
      }
    })
}

export const createInvoiceSchema = refineInvoice(
  z.object({
    ...baseInvoiceShape,
    /** `send` creates the invoice and immediately opens the send dialog. */
    intent: z.enum(['draft', 'send']).default('draft'),
  }),
)

export const updateInvoiceSchema = refineInvoice(
  z.object({
    ...baseInvoiceShape,
    /** Required to edit an invoice that has already gone out (INV-12). */
    confirmSentEdit: z.boolean().optional().default(false),
  }),
)

export const INVOICE_SORTS = ['newest', 'oldest', 'due_date', 'due_date_desc', 'amount_desc', 'amount_asc', 'number_asc', 'number_desc'] as const
export type InvoiceSort = (typeof INVOICE_SORTS)[number]

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'draft', 'sent', 'paid', 'overdue']).default('all'),
  client: z.string().uuid().optional().catch(undefined),
  sort: z.enum(INVOICE_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).catch(10).default(10),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
})

export const sendInvoiceSchema = z.object({
  to: z.string().trim().min(1, { message: 'Recipient email is required' }).email({ message: 'Enter a valid email address' }),
  subject: requiredText('Subject', 200),
  message: optionalText('Message', 2000),
  /** Repeat submissions with the same key are answered from the first result. */
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
})

export const remindInvoiceSchema = z.object({
  message: optionalText('Message', 1000),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
})

export const publicLinkActionSchema = z.object({
  action: z.enum(['create', 'revoke', 'regenerate']),
})

export const paymentSchema = z.object({
  method: z.enum(['card', 'bank_transfer']),
  payerNote: optionalText('Note', 300),
  /** Guarantees a double-clicked Pay button cannot pay twice (PAY-03). */
  idempotencyKey: z.string().trim().min(8).max(80),
  /** The total the client was shown; a mismatch is rejected (PAY-05). */
  expectedTotal: z.string().trim().max(24).optional(),
})

export const recordPaymentSchema = z.object({
  method: z.enum(['card', 'bank_transfer', 'manual']).default('manual'),
  note: optionalText('Note', 300),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>
export type RemindInvoiceInput = z.infer<typeof remindInvoiceSchema>
export type PaymentInput = z.infer<typeof paymentSchema>
