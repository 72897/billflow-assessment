'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormError } from '@/components/ui/error-state'
import { Field, FieldInput } from '@/components/ui/field'
import { api, applyFieldErrors } from '@/lib/api/client'
import { PASSWORD_MIN_LENGTH, signupSchema } from '@/lib/validation/auth'

type SignupFormValues = z.infer<typeof signupSchema>

/**
 * The signup schema is shared with the route handler, so the password rule the
 * form enforces and the rule the server enforces cannot drift apart.
 */
function SignupForm() {
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  })

  const submitting = form.formState.isSubmitting

  async function onSubmit(values: SignupFormValues) {
    setFormError(null)
    try {
      await api.post('/api/auth/signup', values)
      // Signup signs you in, so go straight to the dashboard with a full
      // navigation — the same reasoning as sign-in.
      window.location.assign('/dashboard')
    } catch (error) {
      setFormError(applyFieldErrors(form.setError, error, ['fullName', 'email', 'password']))
    }
  }

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-2xl">Create your account</h1>
        <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">
          Free to set up. Your first invoice takes about three minutes.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <FormError message={formError} />

            <Field label="Full name" error={form.formState.errors.fullName?.message}>
              <FieldInput autoComplete="name" autoFocus placeholder="Aria Mehta" {...form.register('fullName')} />
            </Field>

            <Field label="Email" error={form.formState.errors.email?.message}>
              <FieldInput
                type="email"
                autoComplete="email"
                placeholder="you@studio.com"
                {...form.register('email')}
              />
            </Field>

            <Field
              label="Password"
              error={form.formState.errors.password?.message}
              hint={`At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`}
            >
              <FieldInput
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...form.register('password')}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-4 text-2xs leading-relaxed text-muted-foreground">
            You will land on your dashboard already signed in. Your business name, logo and currency can be set up
            later in Settings — invoices work with the defaults until then.
          </p>
        </CardContent>
      </Card>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary transition-colors hover:text-primary-hover">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export { SignupForm }
