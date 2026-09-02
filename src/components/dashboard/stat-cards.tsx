import Link from 'next/link'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Clock, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { cn, pluralise } from '@/lib/utils'
import type { DashboardStats } from '@/types'

/**
 * A stat card that becomes a link when there is somewhere worth going.
 *
 * Wrapping the whole card rather than just its caption turns a 12px line of text
 * into a 110px target and lets the surface lift under the pointer, which is the
 * clearest way to say "this number is a filtered list". When the figure is zero
 * there is nothing to filter, so it stays a plain card and stops inviting a
 * click that would land on an empty screen.
 */
function StatCard({ href, tone, children }: { href?: string; tone?: string; children: React.ReactNode }) {
  if (!href) return <Card className={cn('p-4 sm:p-5', tone)}>{children}</Card>
  return (
    <Card interactive className={cn('group', tone)}>
      <Link href={href} className="block rounded-lg p-4 sm:p-5">
        {children}
      </Link>
    </Card>
  )
}

/** The label-and-icon line every card opens with. */
function StatLabel({ label, icon, tone }: { label: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <span className={cn('flex size-7 items-center justify-center rounded-md', tone)}>{icon}</span>
    </div>
  )
}

/**
 * The three numbers a freelancer actually opens the app for: earned, outstanding,
 * overdue.
 *
 * Outstanding and overdue link into the invoice list with the matching filter
 * already applied, because "you are owed 84,000" invites exactly one question and
 * the answer should be one tap away. Overdue is a subset of outstanding, which the
 * captions say out loud so the figures do not look like they should add up.
 */
function StatCards({ stats }: { stats: DashboardStats }) {
  const change = stats.earnedChangePercent
  const up = (change ?? 0) >= 0

  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <StatCard>
        <StatLabel
          label="Total earned"
          icon={<Wallet className="size-4" aria-hidden />}
          tone="bg-success-subtle text-success"
        />
        <p className="tabular mt-3 text-2xl font-semibold tracking-[-0.02em]">
          {formatMoney(stats.totalEarned, stats.currency)}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 text-2xs">
          {change === null ? (
            <span className="text-muted-foreground">
              {stats.paidCount > 0
                ? `Across ${pluralise(stats.paidCount, 'paid invoice')}`
                : 'No payments received yet'}
            </span>
          ) : (
            <>
              <span className={cn('flex items-center gap-0.5 font-medium', up ? 'text-success' : 'text-danger')}>
                {up ? (
                  <ArrowUpRight className="size-3.5" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden />
                )}
                {Math.abs(change)}%
              </span>
              <span className="text-muted-foreground">vs last month</span>
            </>
          )}
        </div>
      </StatCard>

      <StatCard href={stats.outstandingCount > 0 ? '/invoices?status=sent' : undefined}>
        <StatLabel
          label="Outstanding"
          icon={<Clock className="size-4" aria-hidden />}
          tone="bg-primary/[0.08] text-primary"
        />
        <p className="tabular mt-3 text-2xl font-semibold tracking-[-0.02em]">
          {formatMoney(stats.outstanding, stats.currency)}
        </p>
        <p className="mt-1.5 text-2xs text-muted-foreground">
          {stats.outstandingCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-medium text-primary">
              {pluralise(stats.outstandingCount, 'unpaid invoice')}
              <ChevronRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
            </span>
          ) : (
            'Everything you have sent is paid'
          )}
        </p>
      </StatCard>

      <StatCard
        href={stats.overdueCount > 0 ? '/invoices?status=overdue' : undefined}
        tone={stats.overdue > 0 ? 'border-danger-border' : undefined}
      >
        <StatLabel
          label="Overdue"
          icon={<AlertTriangle className="size-4" aria-hidden />}
          tone={stats.overdue > 0 ? 'bg-danger-subtle text-danger' : 'bg-muted text-muted-foreground'}
        />
        <p className={cn('tabular mt-3 text-2xl font-semibold tracking-[-0.02em]', stats.overdue > 0 && 'text-danger')}>
          {formatMoney(stats.overdue, stats.currency)}
        </p>
        <p className="mt-1.5 text-2xs text-muted-foreground">
          {stats.overdueCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-medium text-danger">
              {pluralise(stats.overdueCount, 'invoice')} past due
              <ChevronRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
            </span>
          ) : (
            'Nothing past its due date'
          )}
        </p>
      </StatCard>
    </div>
  )
}

export { StatCards }
