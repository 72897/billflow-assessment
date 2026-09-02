import { z } from 'zod'
import { CURRENCY_CODES, DEFAULT_CURRENCY } from '@/lib/money'
import { decimalField, optionalEmailField, optionalText, requiredText, trimmed } from './fields'

export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const

export const invoicePrefixField = trimmed
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(1, { message: 'Invoice prefix is required' })
      .max(10, { message: 'Invoice prefix must be 10 characters or fewer' })
      .regex(/^[A-Z0-9-]+$/, { message: 'Use letters, numbers and dashes only' }),
  )

export const settingsSchema = z.object({
  /** The invoice letterhead, so it cannot be blank. */
  businessName: requiredText('Business name', 120),
  businessEmail: optionalEmailField,
  phone: optionalText('Phone number', 40),
  address: optionalText('Address', 500),
  taxId: optionalText('Tax / GSTIN', 40),
  currency: z.enum(CURRENCY_CODES as unknown as [string, ...string[]]).default(DEFAULT_CURRENCY),
  invoicePrefix: invoicePrefixField,
  nextInvoiceNumber: z.coerce
    .number({ invalid_type_error: 'Next invoice number must be a number' })
    .int({ message: 'Next invoice number must be a whole number' })
    .min(1, { message: 'Next invoice number must be 1 or higher' })
    .max(999_999, { message: 'Next invoice number is too large' }),
  defaultTaxRate: decimalField({ label: 'Default tax rate', scale: 2, min: 0, max: 10_000 }).default(0),
  defaultNotes: optionalText('Default notes', 2000),
  paymentTermsDays: z.coerce
    .number({ invalid_type_error: 'Payment terms must be a number' })
    .int({ message: 'Payment terms must be a whole number of days' })
    .min(0, { message: 'Payment terms cannot be negative' })
    .max(365, { message: 'Payment terms cannot exceed 365 days' })
    .default(14),
})

/**
 * How many bytes a base64 data URL decodes to, without decoding it. The size
 * limit has to be enforced on the server as well as in the file picker: the
 * request is JSON, so nothing stops a caller posting a 40 MB string.
 */
export function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1).replace(/\s/g, '')
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export const logoUploadSchema = z.object({
  /** `data:image/png;base64,...` produced by the file picker in the browser. */
  dataUrl: z
    .string()
    .min(1, { message: 'Choose an image to upload' })
    .refine((value) => /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(value), {
      message: 'Upload a PNG, JPG, WEBP or SVG image',
    })
    .refine((value) => dataUrlByteLength(value) <= LOGO_MAX_BYTES, {
      message: 'Logo must be 2MB or smaller',
    }),
  fileName: optionalText('File name', 200),
})

export type SettingsInput = z.infer<typeof settingsSchema>
export type LogoUploadInput = z.infer<typeof logoUploadSchema>
