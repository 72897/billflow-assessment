import { z } from 'zod'
import { optionalEmailField, optionalText, requiredText } from './fields'

export const clientSchema = z.object({
  name: requiredText('Client name', 120),
  company: optionalText('Company', 120),
  /**
   * Optional: an invoice can go out as a share link, so a client with only a
   * phone number is a real client. The send dialog asks for an address then.
   */
  email: optionalEmailField,
  phone: optionalText('Phone number', 40),
  address: optionalText('Address', 500),
  notes: optionalText('Notes', 1000),
})

export const clientListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  includeArchived: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === '1' || value === 'true'),
  sort: z.enum(['name_asc', 'name_desc', 'newest', 'oldest', 'billed_desc']).default('name_asc'),
})

export type ClientInput = z.infer<typeof clientSchema>
export type ClientListQuery = z.infer<typeof clientListQuerySchema>
