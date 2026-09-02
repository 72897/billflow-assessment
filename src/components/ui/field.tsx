'use client'

import { createContext, forwardRef, useContext, useId } from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectTrigger } from '@/components/ui/select'
import { Textarea, type TextareaProps } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface FieldContextValue {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

export interface FieldControlProps {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  invalid?: boolean
}

/**
 * Reads the ids the surrounding `<Field>` generated.
 *
 * Spread onto the input: `<Input {...useFieldProps()} />`. That is what keeps
 * the label's `for`, the error's `aria-describedby` and `aria-invalid` in step
 * with each other - accessibility that has to be re-wired by hand on every form
 * is accessibility that will be wrong on some of them.
 */
export function useFieldProps(): FieldControlProps {
  const context = useContext(FieldContext)
  if (!context) return {}
  return {
    id: context.id,
    'aria-describedby': context.describedBy,
    'aria-invalid': context.invalid || undefined,
    invalid: context.invalid,
  }
}

export interface FieldProps {
  label?: React.ReactNode
  /** Guidance shown under the input while it is valid. */
  hint?: React.ReactNode
  error?: string
  optional?: boolean
  required?: boolean
  className?: string
  children: React.ReactNode
  /** Puts the label and control side by side, for switch-style rows. */
  layout?: 'stacked' | 'inline'
}

function Field({ label, hint, error, optional, required, className, children, layout = 'stacked' }: FieldProps) {
  const base = useId()
  const id = `${base}-field`
  const errorId = `${base}-error`
  const hintId = `${base}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div
        className={cn(
          layout === 'inline' ? 'flex items-center justify-between gap-4' : 'flex flex-col gap-1.5',
          className,
        )}
      >
        {label ? (
          <Label htmlFor={id} optional={optional}>
            {label}
            {required ? (
              <span className="text-danger" aria-hidden>
                *
              </span>
            ) : null}
          </Label>
        ) : null}

        <div className={cn(layout === 'inline' && 'shrink-0')}>{children}</div>

        {error ? (
          <p id={errorId} role="alert" className="text-[13px] leading-snug text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-[13px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

/**
 * `Input` already wired to the surrounding `Field`.
 *
 * The ref is forwarded rather than swallowed by the wrapper, which matters more
 * than it looks: react-hook-form uses it to write values back into the DOM
 * (`setValue`) and to focus the first field that failed validation.
 */
const FieldInput = forwardRef<HTMLInputElement, InputProps>(function FieldInput(props, ref) {
  const fieldProps = useFieldProps()
  return <Input ref={ref} {...fieldProps} {...props} />
})

const FieldTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function FieldTextarea(props, ref) {
  const fieldProps = useFieldProps()
  return <Textarea ref={ref} {...fieldProps} {...props} />
})

/**
 * A `SelectTrigger` wired to the surrounding `Field`.
 *
 * Radix renders the trigger as a button, so the `Field`'s `<label for>` binds to
 * it exactly as it would to an input - clicking the label focuses the select and
 * a screen reader reads the two together. Without this the label would point at
 * an id that no element has.
 */
const FieldSelectTrigger = forwardRef<
  React.ElementRef<typeof SelectTrigger>,
  React.ComponentPropsWithoutRef<typeof SelectTrigger>
>(function FieldSelectTrigger(props, ref) {
  const fieldProps = useFieldProps()
  return <SelectTrigger ref={ref} {...fieldProps} {...props} />
})

/** Groups related fields under a heading, with the app's standard spacing. */
function FieldSet({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      {title ? (
        <legend className="mb-0.5 text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</legend>
      ) : null}
      {description ? <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className={cn('grid gap-4', !description && title && 'mt-4')}>{children}</div>
    </fieldset>
  )
}

/** Two columns from `sm:` up, one below. Most of the app's forms are this. */
function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
}

export { Field, FieldInput, FieldRow, FieldSelectTrigger, FieldSet, FieldTextarea }
