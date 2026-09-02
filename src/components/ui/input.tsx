'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const inputBase =
  'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'

// `prefix` is omitted from the DOM attributes deliberately: HTML has a global
// `prefix` attribute typed as a string, and this one takes a node.
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Draws the error ring and is forwarded to `aria-invalid`. */
  invalid?: boolean
  /** Rendered inside the field, before the text — a currency symbol, say. */
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, prefix, suffix, type = 'text', ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          inputBase,
          invalid && 'border-danger-border focus-visible:border-danger focus-visible:ring-danger/20',
          prefix && 'pl-0',
          suffix && 'pr-0',
          (prefix || suffix) && 'h-auto border-0 bg-transparent shadow-none focus-visible:ring-0',
          className,
        )}
        {...props}
      />
    )

    if (!prefix && !suffix) return field

    // The wrapper owns the border so the whole affordance lights up on focus,
    // rather than a ring appearing around the text but not the symbol.
    return (
      <div
        className={cn(
          inputBase,
          'items-center gap-1.5 py-0',
          invalid && 'border-danger-border focus-within:border-danger focus-within:ring-danger/20',
          'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
        )}
      >
        {prefix ? <span className="shrink-0 select-none text-sm text-muted-foreground">{prefix}</span> : null}
        {field}
        {suffix ? <span className="shrink-0 select-none text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input }
