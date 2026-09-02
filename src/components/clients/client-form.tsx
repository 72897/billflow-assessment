'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { FormError } from '@/components/ui/error-state'
import { Field, FieldInput, FieldRow, FieldSet, FieldTextarea } from '@/components/ui/field'
import { api, applyFieldErrors } from '@/lib/api/client'
import { clientSchema } from '@/lib/validation/client'
import type { Client } from '@/types'

type ClientFormValues = z.infer<typeof clientSchema>

const FIELDS = ['name', 'company', 'email', 'phone', 'address', 'notes'] as const

export interface ClientFormProps {
  /** Present when editing; absent when creating. */
  client?: Client
  /** Where to go after a successful save. Defaults to the client's own page. */
  returnTo?: string
  /** Rendered beside Cancel - the edit screen's Delete action. */
  danger?: React.ReactNode
}

/**
 * One form behind both "Add client" and "Edit client" (Screens 6 and 7).
 *
 * The resolver is the same `clientSchema` the route handler parses, so the rule
 * that rejects a value in the browser is literally the rule that rejects it on
 * the server - there is no second copy to drift. The server still validates:
 * this form is a convenience, not a gate.
 */
function ClientForm({ client, returnTo, danger }: ClientFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const editing = Boolean(client)

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name ?? '',
      company: client?.company ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      address: client?.address ?? '',
      notes: client?.notes ?? '',
    },
  })

  const submitting = form.formState.isSubmitting
  const cancelHref = returnTo ?? (client ? `/clients/${client.id}` : '/clients')

  async function onSubmit(values: ClientFormValues) {
    setFormError(null)
    try {
      if (client) {
        await api.patch<{ client: Client }>(`/api/clients/${client.id}`, values)
        toast.success('Client updated')
        router.push(returnTo ?? `/clients/${client.id}`)
      } else {
        const data = await api.post<{ client: Client }>('/api/clients', values)
        toast.success(`${data.client.name} added`)
        router.push(returnTo ?? `/clients/${data.client.id}`)
      }
      // The list and the picker are server-rendered, so they need to be told
      // that what they cached is now out of date.
      router.refresh()
    } catch (error) {
      setFormError(applyFieldErrors(form.setError, error, FIELDS))
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardContent className="grid gap-6 pt-5">
          <FormError message={formError} />

          <FieldSet title="Who you are billing">
            <FieldRow>
              <Field label="Client name" required error={form.formState.errors.name?.message}>
                <FieldInput autoComplete="off" autoFocus={!editing} placeholder="Aria Mehta" {...form.register('name')} />
              </Field>
              <Field label="Company" optional error={form.formState.errors.company?.message}>
                <FieldInput autoComplete="off" placeholder="Northwind Studio" {...form.register('company')} />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field
                label="Email"
                optional
                error={form.formState.errors.email?.message}
                hint="Used to send invoices. Without it you can still share a payment link."
              >
                <FieldInput type="email" autoComplete="off" placeholder="aria@northwind.com" {...form.register('email')} />
              </Field>
              <Field label="Phone" optional error={form.formState.errors.phone?.message}>
                <FieldInput type="tel" autoComplete="off" placeholder="+91 98200 12345" {...form.register('phone')} />
              </Field>
            </FieldRow>
          </FieldSet>

          <FieldSet
            title="Billing details"
            description="Both appear on invoices for this client. You can leave them empty and add them later."
          >
            <Field label="Billing address" optional error={form.formState.errors.address?.message}>
              <FieldTextarea rows={3} placeholder={'14 Linking Road\nBandra West, Mumbai 400050'} {...form.register('address')} />
            </Field>

            <Field
              label="Internal notes"
              optional
              error={form.formState.errors.notes?.message}
              hint="Only you can see these. They never appear on an invoice."
            >
              <FieldTextarea rows={3} placeholder="Pays on the 1st. Prefers a PO number on every invoice." {...form.register('notes')} />
            </Field>
          </FieldSet>
        </CardContent>

        <CardFooter className="justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={submitting}>
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save client'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)} disabled={submitting}>
              Cancel
            </Button>
          </div>
          {danger}
        </CardFooter>
      </Card>
    </form>
  )
}

export { ClientForm }
