'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormError } from '@/components/ui/error-state'
import { Field, FieldInput, FieldRow, FieldTextarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toaster'
import { api, applyFieldErrors } from '@/lib/api/client'
import { clientSchema } from '@/lib/validation/client'
import type { Client } from '@/types'

type ClientDialogValues = z.infer<typeof clientSchema>

/** Only the inputs this dialog shows - internal notes stay on the full screen. */
const FIELDS = ['name', 'company', 'email', 'phone', 'address'] as const

const BLANK: ClientDialogValues = { name: '', company: '', email: '', phone: '', address: '', notes: '' }

export interface NewClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefills the name - the one the composer read out of the note, usually. */
  defaultName?: string
  /** The row that was written, so the caller can select it straight away. */
  onCreated: (client: Client) => void
}

/**
 * Adds a client without leaving the invoice being written.
 *
 * This is the `/clients/new` screen minus the navigation: the same `clientSchema`
 * the route handler parses is the resolver here, so a value rejected in the
 * browser is rejected by literally the same rule on the server. Only the name is
 * required - an invoice can go out as a share link, so a client with nothing but
 * a name is a real client, and the send dialog asks for an address when it needs
 * one. Everything else can be filled in now or on the client's own page later.
 */
function NewClientDialog({ open, onOpenChange, defaultName = '', onCreated }: NewClientDialogProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ClientDialogValues>({ resolver: zodResolver(clientSchema), defaultValues: BLANK })
  const submitting = form.formState.isSubmitting

  // Cleared on the way in rather than on the way out: a dialog that is closing is
  // still on screen for 150ms, and emptying its fields mid-animation is visible.
  useEffect(() => {
    if (!open) return
    setFormError(null)
    form.reset({ ...BLANK, name: defaultName })
  }, [open, defaultName, form])

  const save = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const { client } = await api.post<{ client: Client }>('/api/clients', values)
      onCreated(client)
      onOpenChange(false)
      toast.success(`${client.name} added`, { description: 'Selected on this invoice.' })
      // The clients list and the counts in the sidebar are server-rendered from
      // the row that was just written.
      router.refresh()
    } catch (error) {
      setFormError(applyFieldErrors(form.setError, error, FIELDS))
    }
  })

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{defaultName ? `Add ${defaultName}` : 'Add a client'}</DialogTitle>
          <DialogDescription>
            The name is the only part that is required. The rest prints on their invoices, and can wait.
          </DialogDescription>
        </DialogHeader>

        {/*
         * Deliberately not a <form>. This opens from inside the invoice form, and
         * React bubbles events out of a portal along the component tree rather
         * than the DOM one - a nested submit would reach the invoice's own handler
         * and save it. Enter is wired to the same function the button calls.
         */}
        <DialogBody
          className="grid gap-4"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
              event.preventDefault()
              void save()
            }
          }}
        >
          <FormError message={formError} />

          <FieldRow>
            <Field label="Client name" required error={form.formState.errors.name?.message}>
              <FieldInput autoComplete="off" placeholder="Aria Mehta" {...form.register('name')} />
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
              hint="Needed to email an invoice. Without it you can still send a payment link."
            >
              <FieldInput type="email" autoComplete="off" placeholder="aria@northwind.com" {...form.register('email')} />
            </Field>
            <Field label="Phone" optional error={form.formState.errors.phone?.message}>
              <FieldInput type="tel" autoComplete="off" placeholder="+91 98200 12345" {...form.register('phone')} />
            </Field>
          </FieldRow>

          <Field
            label="Billing address"
            optional
            error={form.formState.errors.address?.message}
            hint="Printed under their name on every invoice."
          >
            <FieldTextarea rows={3} placeholder={'14 Linking Road\nBandra West, Mumbai 400050'} {...form.register('address')} />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} loading={submitting} loadingText="Saving…">
            Save client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { NewClientDialog }
