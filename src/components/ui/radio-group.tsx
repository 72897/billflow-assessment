'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const RadioGroup = forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
))
RadioGroup.displayName = 'RadioGroup'

const RadioGroupItem = forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square size-4 shrink-0 rounded-full border border-input bg-card shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[5px] data-[state=checked]:border-primary',
      className,
    )}
    {...props}
  />
))
RadioGroupItem.displayName = 'RadioGroupItem'

/**
 * A whole selectable card, used by the payment sheet: the tap target is the
 * card, not a 16px circle, which is what makes it usable on a phone.
 */
const RadioCard = forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
    title: React.ReactNode
    description?: React.ReactNode
    icon?: React.ReactNode
  }
>(({ className, title, description, icon, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'group flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-left shadow-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary/[0.04] data-[state=checked]:ring-1 data-[state=checked]:ring-primary',
      className,
    )}
    {...props}
  >
    {icon ? (
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-data-[state=checked]:bg-primary/10 group-data-[state=checked]:text-primary [&_svg]:size-4">
        {icon}
      </span>
    ) : null}
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-foreground">{title}</span>
      {description ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span> : null}
    </span>
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-card transition-colors group-data-[state=checked]:border-[5px] group-data-[state=checked]:border-primary" />
  </RadioGroupPrimitive.Item>
))
RadioCard.displayName = 'RadioCard'

export { RadioCard, RadioGroup, RadioGroupItem }
