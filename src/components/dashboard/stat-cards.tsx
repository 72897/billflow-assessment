import Link from 'next/link'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { cn, pluralise } from '@/lib/utils'
import type { DashboardStats } from '@/types'

/**
 * The three numbers the brief asks for: earned, outstanding, overdue.
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
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">Total earned</p>
          <span className="flex size-7 items-center justify-center rounded-md bg-success-subtle text-success">
            <Wallet className="size-4" aria-hidden />
          </span>
        </div>
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
              <span
                className={cn(
                  'flex items-center gap-0.5 font-medium',
                  up ? 'text-success' : 'text-danger',
                )}
              >
                {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                {Math.abs(change)}%
              </span>
              <span className="text-muted-foreground">vs last month</span>
            </>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">Outstanding</p>
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/[0.08] text-primary">
            <Clock className="size-4" aria-hidden />
          </span>
        </div>
        <p className="tabular mt-3 text-2xl font-semibold tracking-[-0.02em]">
          {formatMoney(stats.outstanding, stats.currency)}
        </p>
        <p className="mt-1.5 text-2xs text-muted-foreground">
          {stats.outstandingCount > 0 ? (
            <Link href="/invoices?status=sent" className="font-medium text-primary transition-colors hover:text-primary-hover">
              {pluralise(stats.outstandingCount, 'unpaid invoice')}
            </Link>
          ) : (
            'Everything you have sent is paid'
          )}
        </p>
      </Card>

      <Card className={cn('p-4 sm:p-5', stats.overdue > 0 && 'border-danger-border')}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">Overdue</p>
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-md',
              stats.overdue > 0 ? 'bg-danger-subtle text-danger' : 'bg-muted text-muted-foreground',
            )}
          >
            <AlertTriangle className="size-4" aria-hidden />
          </span>
        </div>
        <p
          className={cn(
            'tabular mt-3 text-2xl font-semibold tracking-[-0.02em]',
            stats.overdue > 0 && 'text-danger',
          )}
        >
          {formatMoney(stats.overdue, stats.currency)}
        </p>
        <p className="mt-1.5 text-2xs text-muted-foreground">
          {stats.overdueCount > 0 ? (
            <Link href="/invoices?status=overdue" className="font-medium text-danger transition-colors hover:opacity-80">
              {pluralise(stats.overdueCount, 'invoice')} past due
            </Link>
          ) : (
            'Nothing past its due date'
          )}
        </p>
      </Card>
    </div>
  )
}

export { StatCards }
