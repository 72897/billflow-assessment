import { z } from 'zod'
import { parseDecimalToMinor } from '@/lib/money'

/** Trims, and treats a whitespace-only string as empty. */
export const trimmed = z.string().transform((value) => value.trim())

export function requiredText(label: string, max: number, min = 1) {
  return trimmed.pipe(
    z
      .string()
      .min(min, { message: `${label} is required` })
      .max(max, { message: `${label} must be ${max} characters or fewer` }),
  )
}

export function optionalText(label: string, max: number) {
  return trimmed.pipe(z.string().max(max, { message: `${label} must be ${max} characters or fewer` })).default('')
}

export const emailField = trimmed.pipe(
  z
    .string()
    .min(1, { message: 'Email is required' })
    .max(254, { message: 'Email is too long' })
    .email({ message: 'Enter a valid email address' }),
).transform((value) => value.toLowerCase())

export const optionalEmailField = trimmed
  .pipe(z.union([z.literal(''), z.string().email({ message: 'Enter a valid email address' }).max(254)]))
  .default('')

/** `YYYY-MM-DD`, validated as a date that actually exists. */
export const isoDateField = trimmed.pipe(
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter a date as YYYY-MM-DD' })
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number)
      const date = new Date(Date.UTC(year, month - 1, day))
      return (
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 1970 && year <= 2200
      )
    }, { message: 'Enter a valid date' }),
)

interface DecimalOptions {
  label: string
  /** Decimal places kept: 2 for money and percentages, 3 for quantities. */
  scale: number
  /** Inclusive bounds, expressed in the same integer units as the result. */
  min?: number
  max?: number
  /** Reject exactly zero (used for quantity). */
  exclusiveMin?: number
}

/**
 * Accepts a form string or a number and yields an exact integer:
 * minor units for money, thousandths for quantity, basis points for a rate.
 * Rejects NaN/Infinity/negatives up front, so a hostile payload cannot reach
 * the calculation layer (INV-07).
 */
export function decimalField(options: DecimalOptions) {
  return z.union([z.string(), z.number()]).transform((raw, ctx) => {
    const parsed = parseDecimalToMinor(raw, options.scale)
    if (parsed === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${options.label} must be a number` })
      return z.NEVER
    }
    if (options.exclusiveMin !== undefined && parsed <= options.exclusiveMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${options.label} must be greater than ${options.exclusiveMin / 10 ** options.scale}`,
      })
      return z.NEVER
    }
    if (options.min !== undefined && parsed < options.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${options.label} cannot be less than ${options.min / 10 ** options.scale}`,
      })
      return z.NEVER
    }
    if (options.max !== undefined && parsed > options.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${options.label} cannot be more than ${(options.max / 10 ** options.scale).toLocaleString()}`,
      })
      return z.NEVER
    }
    return parsed
  })
}

export const uuidField = z.string().uuid({ message: 'Select a valid record' })

/** Largest value that fits numeric(14,2): 999,999,999,999.99 */
export const MAX_MONEY_MINOR = 99_999_999_999_999
/** A single invoice is capped well below the column limit to keep totals sane. */
export const MAX_LINE_AMOUNT_MINOR = 99_999_999_99 // 99,999,999.99
