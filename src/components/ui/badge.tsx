import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { STATUS_LABELS, type DisplayStatus } from '@/lib/invoice/status'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/20 bg-primary/10 text-primary',
        info: 'border-blue-200 bg-blue-50 text-blue-700',
        success: 'border-success-border bg-success-subtle text-success',
        warning: 'border-warning-border bg-warning-subtle text-warning',
        danger: 'border-danger-border bg-danger-subtle text-danger',
        outline: 'border-border bg-card text-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-2xs',
        md: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
}

/** Status colours live here so the list, the detail page and the PDF agree. */
const STATUS_TONE: Record<DisplayStatus, NonNullable<BadgeProps['tone']>> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
}

const STATUS_DOT: Record<DisplayStatus, string> = {
  draft: 'bg-slate-400',
  sent: 'bg-blue-500',
  paid: 'bg-emerald-500',
  overdue: 'bg-red-500',
}

export interface StatusPillProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: DisplayStatus
  /** Hides the leading dot in tight rows. */
  dot?: boolean
}

function StatusPill({ status, dot = true, className, size, ...props }: StatusPillProps) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size} className={cn('capitalize', className)} {...props}>
      {dot ? <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} aria-hidden /> : null}
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export { Badge, badgeVariants, StatusPill, STATUS_TONE }
