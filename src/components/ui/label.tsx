'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { optional?: boolean }
>(({ className, optional, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('flex items-center gap-1.5 text-[13px] font-medium leading-none text-foreground', className)}
    {...props}
  >
    {children}
    {optional ? <span className="text-2xs font-normal text-muted-foreground">optional</span> : null}
  </LabelPrimitive.Root>
))
Label.displayName = 'Label'

export { Label }
