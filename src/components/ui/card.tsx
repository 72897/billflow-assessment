import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Marks a card that is itself a link or a button. It rises one pixel on hover
   * and firms up its border, so a clickable card announces itself before the
   * cursor turns into a hand.
   */
  interactive?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border border-border bg-card text-card-foreground shadow-card',
      interactive && 'surface-interactive',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1 px-4 py-4 sm:px-5', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

/** Header with actions on the right, which is most of them. */
const CardHeaderRow = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5', className)}
      {...props}
    />
  ),
)
CardHeaderRow.displayName = 'CardHeaderRow'

const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-[15px] font-semibold leading-tight tracking-[-0.01em]', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-[13px] leading-relaxed text-muted-foreground', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-4 pb-5 sm:px-5', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-wrap items-center gap-3 border-t border-border px-4 py-3.5 sm:px-5', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

/** A hairline between a card header and its body. */
function CardDivider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-border', className)} />
}

export { Card, CardContent, CardDescription, CardDivider, CardFooter, CardHeader, CardHeaderRow, CardTitle }
