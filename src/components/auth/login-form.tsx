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
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/config'

/**
 * Client-side validation is deliberately looser than the server's: "is there
 * anything in this box" is all that is worth checking before a sign-in attempt.
 * Guessing at whether an address is registered is the server's job, and telling
 * the user their password is "invalid" before trying it is just noise.
 */
const loginFormSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

export interface LoginFormProps {
  /** Where to land afterwards, carried through from the middleware redirect. */
  redirectTo?: string
  /** Arrived from “View demo”: the demo credentials are filled in already. */
  demo?: boolean
}

function LoginForm({ redirectTo, demo = false }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: demo ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : { email: '', password: '' },
  })

  const submitting = form.formState.isSubmitting

  async function onSubmit(values: LoginFormValues) {
    setFormError(null)
    try {
      const data = await api.post<{ redirectTo: string }>('/api/auth/login', { ...values, redirectTo })
      // A full navigation rather than router.push: the session cookie was only
      // just set, and this guarantees every server component renders signed in.
      window.location.assign(data.redirectTo || '/dashboard')
    } catch (error) {
      setFormError(applyFieldErrors(form.setError, error, ['email', 'password']))
    }
  }

  function fillDemo() {
    form.setValue('email', DEMO_EMAIL)
    form.setValue('password', DEMO_PASSWORD)
    form.clearErrors()
    setFormError(null)
  }

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-2xl">Sign in to BillFlow</h1>
        <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">
          Pick up where you left off — your invoices, clients and totals are waiting.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <FormError message={formError} />

            <Field label="Email" error={form.formState.errors.email?.message}>
              <FieldInput
                type="email"
                autoComplete="email"
                autoFocus={!demo}
                placeholder="you@studio.com"
                {...form.register('email')}
              />
            </Field>

            <Field label="Password" error={form.formState.errors.password?.message}>
              <FieldInput
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register('password')}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-5 rounded-md border border-border bg-muted/60 px-3 py-2.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Demo account</p>
            <p className="mt-1 break-all text-[13px] text-foreground">
              {DEMO_EMAIL} <span className="text-muted-foreground">/</span> {DEMO_PASSWORD}
            </p>
            <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0" onClick={fillDemo}>
              Fill these in
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        New to BillFlow?{' '}
        <Link href="/signup" className="font-medium text-primary transition-colors hover:text-primary-hover">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export { LoginForm }
