'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { currencySymbol, formatAmount } from '@/lib/money'
import { EMPTY_LINE_ITEM, type InvoiceFormValues } from './invoice-form-values'

export interface InvoiceLineItemsProps {
  currency: string
  /** Per-row amounts in minor units, index-aligned with the rows. */
  amounts: number[]
  disabled?: boolean
}

/** The schema caps an invoice at 100 rows; the button stops before the 422 does. */
const MAX_ITEMS = 100

const GRID = 'sm:grid-cols-[minmax(0,1fr)_84px_128px_104px_32px]'
const MOBILE_LABEL = 'mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted-foreground sm:hidden'

/**
 * Line items — unlimited rows, each priced as you type.
 *
 * Quantity and rate stay text inputs rather than `type="number"`: a number input
 * loses its value on a stray scroll, rejects a pasted "1,200", and its spinners
 * are useless at these magnitudes. The schema parses the string exactly, so
 * "1,200.50" and "1200.5" both mean the same thing.
 *
 * On a phone each row becomes a card — description, then qty and rate side by
 * side, then the amount and the remove control. A five-column table does not
 * survive a 375px viewport, and squeezing it into one produces inputs too narrow
 * to read what you typed.
 */
function InvoiceLineItems({ currency, amounts, disabled }: InvoiceLineItemsProps) {
  const form = useFormContext<InvoiceFormValues>()
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  // Keyed by the field array's own id, so removing a row cannot hand its
  // "detail is open" state to whichever row slides into that index.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const errors = form.formState.errors.items
  const symbol = currencySymbol(currency)
  const atLimit = fields.length >= MAX_ITEMS

  function addRow() {
    if (atLimit || disabled) return
    append({ ...EMPTY_LINE_ITEM })
  }

  return (
    <div className="grid gap-3">
      <div
        className={`hidden gap-3 px-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid ${GRID}`}
        aria-hidden
      >
        <span>Description</span>
        <span>Qty</span>
        <span>Rate</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      <div className="grid gap-3 sm:gap-2.5">
        {fields.map((field, index) => {
          const row = errors?.[index]
          const showDetail = expanded[field.id] === true || Boolean(form.getValues(`items.${index}.detail`))
          const rowError = row?.description?.message ?? row?.quantity?.message ?? row?.rate?.message ?? row?.detail?.message

          return (
            <div
              key={field.id}
              className={`grid grid-cols-2 gap-2.5 rounded-lg border border-border bg-muted/20 p-3 sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 ${GRID}`}
              onKeyDown={(event) => {
                // Enter inside a row means "next row", not "save the invoice".
                if (event.key !== 'Enter') return
                event.preventDefault()
                if (index === fields.length - 1) addRow()
              }}
            >
              <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                <Input
                  placeholder="Website redesign"
                  aria-label={`Description for line ${index + 1}`}
                  invalid={Boolean(row?.description)}
                  disabled={disabled}
                  {...form.register(`items.${index}.description`)}
                />
                {showDetail ? (
                  <Input
                    placeholder="Optional detail, shown under the description"
                    className="h-8 text-[13px]"
                    aria-label={`Detail for line ${index + 1}`}
                    invalid={Boolean(row?.detail)}
                    disabled={disabled}
                    {...form.register(`items.${index}.detail`)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [field.id]: true }))}
                    disabled={disabled}
                    className="flex w-fit items-center gap-1 rounded text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <Plus className="size-3" aria-hidden />
                    Add detail
                  </button>
                )}
                {rowError ? (
                  <p role="alert" className="text-[13px] leading-snug text-danger">
                    {rowError}
                  </p>
                ) : null}
              </div>

              <div>
                <span className={MOBILE_LABEL} aria-hidden>
                  Qty
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="1"
                  className="tabular"
                  aria-label={`Quantity for line ${index + 1}`}
                  invalid={Boolean(row?.quantity)}
                  disabled={disabled}
                  {...form.register(`items.${index}.quantity`)}
                />
              </div>

              <div>
                <span className={MOBILE_LABEL} aria-hidden>
                  Rate
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="tabular"
                  prefix={symbol}
                  aria-label={`Rate for line ${index + 1}`}
                  invalid={Boolean(row?.rate)}
                  disabled={disabled}
                  {...form.register(`items.${index}.rate`)}
                />
              </div>

              <div className="flex items-center justify-between gap-2 sm:h-9 sm:justify-end">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground sm:hidden" aria-hidden>
                  Amount
                </span>
                <span className="tabular text-sm font-semibold text-foreground">
                  {symbol}
                  {formatAmount(amounts[index] ?? 0, currency)}
                </span>
              </div>

              <div className="flex items-center justify-end sm:h-9">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(index)}
                  disabled={disabled || fields.length === 1}
                  aria-label={`Remove line ${index + 1}`}
                  title={fields.length === 1 ? 'An invoice needs at least one line' : 'Remove this line'}
                  className="hover:bg-danger-subtle hover:text-danger"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={disabled || atLimit}>
          <Plus />
          Add line item
        </Button>
        {errors?.message ? (
          <p role="alert" className="text-[13px] text-danger">
            {errors.message}
          </p>
        ) : atLimit ? (
          <p className="text-[13px] text-muted-foreground">That is the maximum of {MAX_ITEMS} lines on one invoice.</p>
        ) : null}
      </div>
    </div>
  )
}

export { InvoiceLineItems }
