import { z } from 'zod'
import { emailField, requiredText, trimmed } from './fields'

export const PASSWORD_MIN_LENGTH = 8

export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  .max(200, { message: 'Password must be 200 characters or fewer' })
  .refine((value) => /[A-Za-z]/.test(value), { message: 'Password must include at least one letter' })
  .refine((value) => /[0-9]/.test(value), { message: 'Password must include at least one number' })

export const signupSchema = z.object({
  fullName: requiredText('Full name', 120),
  email: emailField,
  password: passwordField,
})

export const loginSchema = z.object({
  email: trimmed.pipe(z.string().min(1, { message: 'Email is required' })).transform((v) => v.toLowerCase()),
  password: z.string().min(1, { message: 'Password is required' }),
  /** Where to land after a successful sign in; validated as a relative path. */
  redirectTo: z
    .string()
    .optional()
    .transform((value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : undefined)),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
