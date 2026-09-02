'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Buttons press.
 *
 * A single pixel of downward travel on `:active`, plus a shadow that deepens on
 * hover and flattens on the press, is what separates a button that feels
 * connected to the pointer from a rectangle that changes colour. The transition
 * lists its properties rather than using `transition-all`, so a width change
 * from a loading label never animates.
 */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out-quint active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover hover:shadow-card active:shadow-none',
        secondary:
          'border border-border bg-card text-foreground shadow-xs hover:border-border-strong hover:bg-secondary active:bg-muted active:shadow-none',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-border/50',
        danger: 'bg-destructive text-destructive-foreground shadow-xs hover:brightness-95 hover:shadow-card active:shadow-none',
        'danger-outline':
          'border border-danger-border bg-danger-subtle text-danger hover:border-danger/40 hover:bg-danger-subtle/70',
        success: 'bg-success text-success-foreground shadow-xs hover:brightness-110 hover:shadow-card active:shadow-none',
        link: 'text-primary underline-offset-4 hover:underline active:translate-y-0',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-9 px-3.5 [&_svg]:size-4',
        lg: 'h-11 px-5 text-[15px] [&_svg]:size-4',
        icon: 'size-9 [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Swaps the leading icon for a spinner and blocks further clicks. */
  loading?: boolean
  loadingText?: string
}

/**
 * `loading` disables the button as well as showing the spinner, which is what
 * stops a double-submit from reaching an endpoint twice.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingText, children, disabled, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      )
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {loading && loadingText ? loadingText : children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
