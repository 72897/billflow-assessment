'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { FormError } from '@/components/ui/error-state'
import { Field, FieldInput, FieldRow, FieldSelectTrigger, FieldSet, FieldTextarea } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toaster'
import { api, applyFieldErrors } from '@/lib/api/client'
import { formatRate, SUPPORTED_CURRENCIES } from '@/lib/money'
import { settingsSchema } from '@/lib/validation/settings'
import type { BusinessSettings } from '@/types'

/**
 * Every numeric field is a string, for the same reason the invoice editor's are:
 * the schema's coercion must run once, on the server. The resolver validates in
 * `raw` mode so what is typed is what is posted.
 */
export interface SettingsFormValues {
  businessName: string
  businessEmail: string
  phone: string
  address: string
  taxId: string
  currency: string
  invoicePrefix: string
  nextInvoiceNumber: string
  defaultTaxRate: string
  defaultNotes: string
  paymentTermsDays: string
}

const FIELDS = [
  'businessName',
  'businessEmail',
  'phone',
  'address',
  'taxId',
  'currency',
  'invoicePrefix',
  'nextInvoiceNumber',
  'defaultTaxRate',
  'defaultNotes',
  'paymentTermsDays',
] as const

export interface SettingsFormProps {
  settings: BusinessSettings
  /** `peek_invoice_number()` — what the next invoice would actually be called. */
  nextInvoiceNumber: string
}

function toFormValues(settings: BusinessSettings): SettingsFormValues {
  return {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    phone: settings.phone,
    address: settings.address,
    taxId: settings.taxId,
    currency: settings.currency,
    invoicePrefix: settings.invoicePrefix,
    nextInvoiceNumber: String(settings.nextInvoiceNumber),
    defaultTaxRate: settings.defaultTaxRate ? formatRate(settings.defaultTaxRate) : '',
    defaultNotes: settings.defaultNotes,
    paymentTermsDays: String(settings.paymentTermsDays),
  }
}

/**
 * Screen 13 — the business profile behind every invoice.
 *
 * Saving here changes the invoices you create *next*, never the ones already
 * sent: each invoice froze a copy of this profile when it was created, so a
 * client's copy cannot change under them after the fact (SET-05). That is worth
 * knowing before you edit an address, so the form says it out loud.
 */
function SettingsForm({ settings, nextInvoiceNumber }: SettingsFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [savedNumber, setSavedNumber] = useState(nextInvoiceNumber)

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema, undefined, { raw: true }),
    defaultValues: toFormValues(settings),
  })

  const { control, formState } = form
  const prefix = useWatch({ control, name: 'invoicePrefix' })
  const counter = useWatch({ control, name: 'nextInvoiceNumber' })

  // Mirrors `peek_invoice_number()`: prefix, dash, four digits. The server may
  // still hand out a later number if this one is already taken.
  const preview = `${(prefix || 'INV').toUpperCase()}-${String(Math.max(1, Number(counter) || 1)).padStart(4, '0')}`

  async function onSubmit(values: SettingsFormValues) {
    setFormError(null)
    try {
      const data = await api.put<{ settings: BusinessSettings; nextInvoiceNumber: string }>('/api/settings', values)
      form.reset(toFormValues(data.settings))
      setSavedNumber(data.nextInvoiceNumber)
      toast.success('Settings saved', { description: `Your next invoice will be ${data.nextInvoiceNumber}.` })
      router.refresh()
    } catch (error) {
      setFormError(applyFieldErrors(form.setError, error, FIELDS))
    }
  }

  const submitting = formState.isSubmitting

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardContent className="grid gap-6 pt-5">
          <FormError message={formError} />

          <FieldSet
            title="Your business"
            description="This is the letterhead on every invoice you send. Invoices already created keep the details they were created with."
          >
            <FieldRow>
              <Field label="Business name" required error={formState.errors.businessName?.message}>
                <FieldInput autoComplete="organization" placeholder="Kunal Studio" {...form.register('businessName')} />
              </Field>
              <Field
                label="Email"
                optional
                error={formState.errors.businessEmail?.message}
                hint="Shown on the invoice as the address to reply to."
              >
                <FieldInput type="email" autoComplete="email" placeholder="hello@kunal.studio" {...form.register('businessEmail')} />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Phone" optional error={formState.errors.phone?.message}>
                <FieldInput type="tel" autoComplete="tel" placeholder="+91 98200 12345" {...form.register('phone')} />
              </Field>
              <Field
                label="Tax / GSTIN"
                optional
                error={formState.errors.taxId?.message}
                hint="Printed under your address when set."
              >
                <FieldInput autoComplete="off" placeholder="27ABCDE1234F1Z5" {...form.register('taxId')} />
              </Field>
            </FieldRow>

            <Field label="Address" optional error={formState.errors.address?.message}>
              <FieldTextarea rows={3} placeholder={'21 Carter Road\nBandra West, Mumbai 400050'} {...form.register('address')} />
            </Field>
          </FieldSet>

          <FieldSet
            title="Invoicing"
            description="Defaults for new invoices. Each one can still be changed on the invoice itself."
          >
            <FieldRow>
              <Field label="Currency" error={formState.errors.currency?.message} hint="Applies to new invoices only.">
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FieldSelectTrigger onBlur={field.onBlur}>
                        <SelectValue />
                      </FieldSelectTrigger>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.map((option) => (
                          <SelectItem key={option.code} value={option.code}>
                            {option.code} — {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field
                label="Payment terms"
                error={formState.errors.paymentTermsDays?.message}
                hint="Days until an invoice is due."
              >
                <FieldInput
                  inputMode="numeric"
                  className="tabular"
                  suffix="days"
                  {...form.register('paymentTermsDays')}
                />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Invoice prefix" required error={formState.errors.invoicePrefix?.message}>
                <FieldInput autoComplete="off" className="uppercase" placeholder="INV" {...form.register('invoicePrefix')} />
              </Field>
              <Field label="Next number" required error={formState.errors.nextInvoiceNumber?.message}>
                <FieldInput inputMode="numeric" className="tabular" {...form.register('nextInvoiceNumber')} />
              </Field>
            </FieldRow>

            <p className="-mt-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">
              Your next invoice will be{' '}
              <span className="tabular font-semibold text-foreground">{preview}</span>
              {preview === savedNumber ? null : <> once you save. Currently {savedNumber}.</>}
            </p>

            <Field
              label="Default tax rate"
              optional
              error={formState.errors.defaultTaxRate?.message}
              hint="Pre-filled on new invoices. Leave blank if you do not charge tax."
            >
              <FieldInput inputMode="decimal" className="tabular sm:max-w-40" suffix="%" placeholder="0" {...form.register('defaultTaxRate')} />
            </Field>

            <Field
              label="Default notes"
              optional
              error={formState.errors.defaultNotes?.message}
              hint="Payment instructions, bank details, a thank you — whatever every invoice should carry."
            >
              <FieldTextarea
                rows={3}
                placeholder={'Bank transfer to Kunal Studio · HDFC 5012 3456 7890 · IFSC HDFC0000123'}
                {...form.register('defaultNotes')}
              />
            </Field>
          </FieldSet>
        </CardContent>

        <CardFooter className="justify-between gap-3">
          <Button type="submit" loading={submitting}>
            {submitting ? 'Saving…' : 'Save settings'}
          </Button>
          {formState.isDirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => {
                form.reset(toFormValues(settings))
                setFormError(null)
              }}
            >
              Discard changes
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </form>
  )
}

export { SettingsForm }
