'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Send, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { NewClientDialog } from '@/components/clients/new-client-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FormError } from '@/components/ui/error-state'
import { Field, FieldInput, FieldRow, FieldSelectTrigger, FieldTextarea } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { api, ApiError, applyFieldErrors } from '@/lib/api/client'
import { calculateInvoice, discountLabel } from '@/lib/invoice/calc'
import {
  currencySymbol,
  formatMoney,
  formatRate,
  parseDecimalToMinor,
  parseQuantityToThousandths,
  parseRateToBasisPoints,
  SUPPORTED_CURRENCIES,
} from '@/lib/money'
import { addDaysToIsoDate, cn, formatDate } from '@/lib/utils'
import { createInvoiceSchema } from '@/lib/validation/invoice'
import type { InvoiceDetail } from '@/types'
import { AiComposer } from './ai-composer'
import { toInvoicePayload, type ClientOption, type InvoiceFormValues } from './invoice-form-values'
import { InvoiceLineItems } from './invoice-line-items'

export interface InvoiceFormProps {
  clients: ClientOption[]
  defaultValues: InvoiceFormValues
  /** Present when editing an existing invoice, absent when creating one. */
  invoice?: InvoiceDetail
}

const DUE_PRESETS = [7, 14, 30] as const

/**
 * The invoice editor, behind both `/invoices/new` and `/invoices/[id]/edit`.
 *
 * Two things make this form worth reading. First, totals are computed here by the
 * same `calculateInvoice` the server uses before writing, so what you watch add up
 * while typing is what gets stored - and the server still recalculates, so a
 * tampered payload changes nothing. Second, the resolver runs in `raw` mode: the
 * schema's transforms decide whether a value is *valid*, but the strings you typed
 * are what gets posted, and scaling to minor units happens once, server-side.
 */
function InvoiceForm({ clients, defaultValues, invoice }: InvoiceFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<InvoiceFormValues | null>(null)
  // Which button is busy. Two submit buttons sharing `isSubmitting` would put a
  // spinner on both, including the one nobody pressed.
  const [pendingAction, setPendingAction] = useState<'draft' | 'send' | null>(null)
  const [addingClient, setAddingClient] = useState(false)
  /** Clients added from this page, before the server props catch up. */
  const [created, setCreated] = useState<ClientOption[]>([])
  const editing = Boolean(invoice)

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(createInvoiceSchema, undefined, { raw: true }),
    defaultValues,
  })

  /**
   * The picker's rows: the ones the server rendered, plus any added here.
   *
   * Merged rather than replaced, because both can be true at once - a
   * `router.refresh()` eventually brings the new client down in `clients`, and
   * until it does the local copy is the only one that exists. Deduplicated by id
   * so the overlap is invisible, and sorted by name the way `listClientOptions`
   * orders it, so a client added now sits where it will sit on the next load.
   */
  const clientOptions = useMemo(() => {
    if (created.length === 0) return clients
    const extra = created.filter((option) => !clients.some((client) => client.id === option.id))
    if (extra.length === 0) return clients
    return [...clients, ...extra].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [clients, created])

  /** Selects a client the moment it exists, whoever created it. */
  function selectClient(client: ClientOption) {
    setCreated((current) => (current.some((option) => option.id === client.id) ? current : [...current, client]))
    form.setValue('clientId', client.id, { shouldValidate: true, shouldDirty: true })
  }

  const { control } = form
  const items = useWatch({ control, name: 'items' })
  const currency = useWatch({ control, name: 'currency' })
  const discountType = useWatch({ control, name: 'discountType' })
  const discountValue = useWatch({ control, name: 'discountValue' })
  const taxRate = useWatch({ control, name: 'taxRate' })
  const issueDate = useWatch({ control, name: 'issueDate' })

  // Unparseable input counts as zero rather than blowing up the summary: the
  // field shows its own error, and a half-typed rate should not blank the total.
  const calc = useMemo(
    () =>
      calculateInvoice({
        items: (items ?? []).map((item) => ({
          quantityThousandths: parseQuantityToThousandths(item?.quantity) ?? 0,
          rateMinor: parseDecimalToMinor(item?.rate) ?? 0,
        })),
        discountType,
        discountValue:
          (discountType === 'percentage' ? parseRateToBasisPoints(discountValue) : parseDecimalToMinor(discountValue)) ?? 0,
        taxRateBasisPoints: parseRateToBasisPoints(taxRate) ?? 0,
      }),
    [items, discountType, discountValue, taxRate],
  )

  const submitting = form.formState.isSubmitting
  const noClients = clientOptions.length === 0
  const symbol = currencySymbol(currency)
  const taxBasisPoints = parseRateToBasisPoints(taxRate) ?? 0
  const discountBasisPoints = discountType === 'percentage' ? (parseRateToBasisPoints(discountValue) ?? 0) : 0
  const cancelHref = invoice ? `/invoices/${invoice.id}` : '/invoices'
  async function save(values: InvoiceFormValues, extra: { intent?: 'draft' | 'send'; confirmSentEdit?: boolean }) {
    const body = toInvoicePayload(values, extra)
    const path = invoice ? `/api/invoices/${invoice.id}` : '/api/invoices'
    const result = invoice
      ? await api.patch<{ invoice: InvoiceDetail }>(path, body)
      : await api.post<{ invoice: InvoiceDetail }>(path, body)
    return result.invoice
  }

  function finish(saved: InvoiceDetail, intent: 'draft' | 'send') {
    toast.success(editing ? `${saved.invoiceNumber} saved` : `${saved.invoiceNumber} created`)
    // The list, the dashboard and the client page are all server-rendered from
    // the same rows this just changed.
    router.refresh()
    // `?send=1` opens the send dialog on the invoice's own page, where the
    // recipient and the message can still be changed before anything leaves.
    router.push(intent === 'send' ? `/invoices/${saved.id}?send=1` : `/invoices/${saved.id}`)
  }

  async function submit(values: InvoiceFormValues, intent: 'draft' | 'send') {
    setFormError(null)
    setPendingAction(intent)
    try {
      finish(await save(values, editing ? {} : { intent }), intent)
    } catch (error) {
      setPendingAction(null)
      // Editing a sent invoice is allowed, but not silently: the server refuses
      // once and asks, and the second attempt carries the confirmation.
      if (error instanceof ApiError && error.code === 'invalid_invoice_state' && error.details?.requiresConfirmation) {
        setConfirming(values)
        return
      }
      setFormError(applyFieldErrors(form.setError, error))
    }
  }

  async function confirmSentEdit() {
    if (!confirming) return
    const saved = await save(confirming, { confirmSentEdit: true })
    setConfirming(null)
    finish(saved, 'draft')
  }

  function setDueInDays(days: number) {
    if (!issueDate) return
    form.setValue('dueDate', addDaysToIsoDate(issueDate, days), { shouldValidate: true, shouldDirty: true })
  }
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => submit(values, 'draft'))} noValidate>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="grid min-w-0 gap-4 lg:col-span-2">
            {/*
             * Create only. On an edit the draft would replace line items that have
             * already been sent to somebody, and an Undo button is thin protection
             * against that. It is offered on an empty account, though: the note
             * usually names the client, and it can now add them.
             */}
            {editing ? null : <AiComposer onClientCreated={selectClient} />}

            <Card>
              <CardContent className="grid gap-4 pt-5">
                <FormError message={formError} />

                {noClients ? (
                  <p className="rounded-lg border border-warning-border bg-warning-subtle px-3.5 py-3 text-[13px] leading-relaxed text-warning">
                    An invoice needs someone to bill.{' '}
                    <button type="button" onClick={() => setAddingClient(true)} className="font-semibold underline">
                      Add your first client
                    </button>{' '}
                    - a name is enough - and they will be picked here without losing what you have typed.
                  </p>
                ) : null}

                <FieldRow>
                  <Field label="Client" required error={form.formState.errors.clientId?.message}>
                    <Controller
                      control={control}
                      name="clientId"
                      render={({ field }) => (
                        <Select
                          value={field.value || undefined}
                          /*
                           * Radix keeps a hidden native `<select>` beside this one for
                           * form autofill, and collects its `<option>`s from the items
                           * as they mount. On the single render where a just-created
                           * client is both added to the list and selected, that element
                           * is handed a value no option has yet, falls back to its
                           * empty first one, and reports the fallback back as a change
                           * of `''` - which would overwrite the id just set. There is no
                           * empty item here, so `''` is never a choice anyone made.
                           * Without this, creating a client from the button or from the
                           * AI composer left "Choose a client" sitting over a form whose
                           * value had been right for about fifteen milliseconds.
                           */
                          onValueChange={(next) => next && field.onChange(next)}
                          disabled={noClients}
                        >
                          <FieldSelectTrigger onBlur={field.onBlur}>
                            <SelectValue placeholder="Choose a client" />
                          </FieldSelectTrigger>
                          <SelectContent>
                            {clientOptions.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.company ? `${client.name} · ${client.company}` : client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>

                  <Field
                    label="Invoice number"
                    required
                    error={form.formState.errors.invoiceNumber?.message}
                    hint="Taken from your prefix. Change it if this one needs to be different."
                  >
                    <FieldInput className="tabular" autoComplete="off" spellCheck={false} {...form.register('invoiceNumber')} />
                  </Field>
                </FieldRow>
                {noClients || editing ? null : (
                  // A dialog rather than the full screen: leaving mid-edit would
                  // drop everything typed so far. An edit already has a client.
                  <button
                    type="button"
                    onClick={() => setAddingClient(true)}
                    className="-mt-1 flex w-fit items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                  >
                    <UserPlus className="size-3.5" aria-hidden />
                    Add a new client
                  </button>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Issue date" required error={form.formState.errors.issueDate?.message}>
                    <FieldInput type="date" {...form.register('issueDate')} />
                  </Field>

                  <Field label="Due date" required error={form.formState.errors.dueDate?.message}>
                    <FieldInput type="date" min={issueDate || undefined} {...form.register('dueDate')} />
                  </Field>

                  <Field label="Currency" error={form.formState.errors.currency?.message}>
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
                                {option.code} - {option.symbol}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span>Due in</span>
                  {DUE_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDueInDays(days)}
                      className="rounded-md border border-border bg-card px-2 py-0.5 font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
                    >
                      {days} days
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Line items</CardTitle>
                <CardDescription>Quantity times rate. Add as many lines as the job needs.</CardDescription>
              </CardHeader>
              <CardContent>
                <InvoiceLineItems currency={currency} amounts={calc.itemAmounts} disabled={submitting} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>Printed under the totals - payment instructions, a PO number, a thank you.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field error={form.formState.errors.notes?.message}>
                  <FieldTextarea
                    rows={3}
                    placeholder={'Payable by bank transfer within 14 days.\nAccount 0012 3456 7890 · IFSC HDFC0000123'}
                    {...form.register('notes')}
                  />
                </Field>
              </CardContent>
            </Card>
          </div>
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Recalculated on the server when you save, from these same numbers.</CardDescription>
            </CardHeader>

            <CardContent className="grid gap-4">
              <Field
                label="Discount"
                error={form.formState.errors.discountType?.message ?? form.formState.errors.discountValue?.message}
              >
                <div className="flex gap-2">
                  <Controller
                    control={control}
                    name="discountType"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? 'none'}
                        onValueChange={(next) => {
                          field.onChange(next === 'none' ? null : next)
                          // Leaving a stale value behind would keep discounting
                          // an invoice whose discount was just turned off.
                          if (next === 'none') form.setValue('discountValue', '')
                        }}
                      >
                        <FieldSelectTrigger className="w-28 shrink-0" onBlur={field.onBlur}>
                          <SelectValue />
                        </FieldSelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="percentage">Percent</SelectItem>
                          <SelectItem value="fixed">Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular"
                    aria-label="Discount value"
                    disabled={!discountType || submitting}
                    prefix={discountType === 'fixed' ? symbol : undefined}
                    suffix={discountType === 'percentage' ? '%' : undefined}
                    invalid={Boolean(form.formState.errors.discountValue)}
                    {...form.register('discountValue')}
                  />
                </div>
              </Field>

              <Field label="Tax rate" error={form.formState.errors.taxRate?.message}>
                <FieldInput inputMode="decimal" placeholder="0" className="tabular" suffix="%" {...form.register('taxRate')} />
              </Field>

              <dl className="grid gap-2 border-t border-border pt-4 text-sm">
                <SummaryRow label="Subtotal" value={formatMoney(calc.subtotal, currency)} />
                {calc.discountAmount > 0 ? (
                  <SummaryRow
                    label={discountLabel(discountType, discountBasisPoints)}
                    value={`− ${formatMoney(calc.discountAmount, currency)}`}
                    tone="success"
                  />
                ) : null}
                {calc.taxAmount > 0 ? (
                  <SummaryRow label={`Tax (${formatRate(taxBasisPoints)}%)`} value={formatMoney(calc.taxAmount, currency)} />
                ) : null}
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
                  <dt className="font-semibold text-foreground">Total</dt>
                  <dd className="tabular text-lg font-semibold tracking-[-0.01em] text-foreground">
                    {formatMoney(calc.total, currency)}
                  </dd>
                </div>
              </dl>
            </CardContent>

            <CardFooter className="grid gap-2">
              {editing ? (
                <Button type="submit" className="w-full" loading={pendingAction === 'draft'} disabled={noClients}>
                  <Save />
                  Save changes
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={form.handleSubmit((values) => submit(values, 'send'))}
                    loading={pendingAction === 'send'}
                    disabled={noClients || submitting}
                  >
                    <Send />
                    Save and send
                  </Button>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    loading={pendingAction === 'draft'}
                    disabled={noClients || submitting}
                  >
                    <Save />
                    Save as draft
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" className="w-full" onClick={() => router.push(cancelHref)} disabled={submitting}>
                Cancel
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
      <NewClientDialog open={addingClient} onOpenChange={setAddingClient} onCreated={selectClient} />
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        tone="primary"
        title="This invoice has already been sent"
        description={`Your client may be holding the version you sent${
          invoice?.sentAt ? ` on ${formatDate(invoice.sentAt)}` : ''
        }. Saving changes your copy - send it again so they see the new one.`}
        confirmLabel="Save anyway"
        onConfirm={confirmSentEdit}
      />
    </FormProvider>
  )
}

/** One line of the totals stack: label left, figure right, digits aligned. */
function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular font-medium text-foreground', tone === 'success' && 'text-success')}>{value}</dd>
    </div>
  )
}

export { InvoiceForm }
