import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  href?: string
}

export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Buttons, right-aligned on a wide screen and stacked under the title on a phone. */
  actions?: React.ReactNode
  breadcrumbs?: Crumb[]
  className?: string
  /** Extra content below the title row - filter bars, tabs, a status strip. */
  children?: React.ReactNode
}

/**
 * The top of every screen, so the vertical rhythm is identical from page to
 * page. Actions wrap under the title on a phone rather than shrinking the
 * heading to fit beside them.
 */
function PageHeader({ title, description, actions, breadcrumbs, className, children }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 sm:mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2.5 flex items-center gap-1 text-[13px] text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="rounded transition-colors hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-[-0.02em] sm:text-[22px]">{title}</h1>
          {description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 no-print">{actions}</div> : null}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

export { PageHeader }
