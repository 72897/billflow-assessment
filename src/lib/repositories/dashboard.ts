/**
 * Dashboard aggregates.
 *
 * Every number is computed by PostgreSQL — `sum(... ) FILTER (WHERE ...)` in one
 * pass for the stat cards, `generate_series` LEFT JOINed against paid invoices
 * for the chart — so the browser receives a handful of totals instead of the
 * whole invoice table.
 *
 * "Overdue" is a subset of "outstanding": an overdue invoice is still money the
 * user is owed, so it is counted in both, exactly as the cards read.
 */

import { query, queryOne } from '@/lib/db'
import { todayIsoDate } from '@/lib/invoice/status'
import { addDaysToIsoDate } from '@/lib/utils'
import type {
  DashboardData,
  DashboardStats,
  IncomePoint,
  IncomeRange,
  NeedsAttentionItem,
} from '@/types'
import type { DisplayStatus } from '@/lib/invoice/status'
import { countClients } from './clients'
import { listRecentInvoices } from './invoices'
import { int, money, text, ts } from './mappers'
import { getSettings } from './settings'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface StatRow extends Record<string, unknown> {
  total_earned: string
  earned_this_month: string
  earned_prev_month: string
  outstanding: string
  outstanding_count: number
  overdue: string
  overdue_count: number
  draft_count: number
  paid_count: number
  sent_count: number
  invoice_count: number
}
/** Percent change vs last month, or null when there is no baseline to compare to. */
function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const [row, clientCount, settings] = await Promise.all([
    queryOne<StatRow>(
      `SELECT
         coalesce(sum(total) FILTER (WHERE status = 'paid'), 0)::text AS total_earned,
         coalesce(sum(total) FILTER (
           WHERE status = 'paid' AND paid_at >= date_trunc('month', now())
         ), 0)::text AS earned_this_month,
         coalesce(sum(total) FILTER (
           WHERE status = 'paid'
             AND paid_at >= date_trunc('month', now()) - interval '1 month'
             AND paid_at <  date_trunc('month', now())
         ), 0)::text AS earned_prev_month,
         coalesce(sum(total) FILTER (WHERE status = 'sent'), 0)::text AS outstanding,
         count(*) FILTER (WHERE status = 'sent')::int AS outstanding_count,
         coalesce(sum(total) FILTER (WHERE status = 'sent' AND due_date < CURRENT_DATE), 0)::text AS overdue,
         count(*) FILTER (WHERE status = 'sent' AND due_date < CURRENT_DATE)::int AS overdue_count,
         count(*) FILTER (WHERE status = 'draft')::int AS draft_count,
         count(*) FILTER (WHERE status = 'paid')::int  AS paid_count,
         count(*) FILTER (WHERE status = 'sent')::int  AS sent_count,
         count(*)::int AS invoice_count
       FROM invoices
       WHERE user_id = $1 AND archived_at IS NULL`,
      [userId],
    ),
    countClients(userId),
    getSettings(userId),
  ])

  const earnedThisMonth = money(row?.earned_this_month)
  const earnedPreviousMonth = money(row?.earned_prev_month)

  return {
    currency: settings.currency,
    totalEarned: money(row?.total_earned),
    totalEarnedThisMonth: earnedThisMonth,
    totalEarnedPreviousMonth: earnedPreviousMonth,
    earnedChangePercent: changePercent(earnedThisMonth, earnedPreviousMonth),
    outstanding: money(row?.outstanding),
    outstandingCount: int(row?.outstanding_count),
    overdue: money(row?.overdue),
    overdueCount: int(row?.overdue_count),
    draftCount: int(row?.draft_count),
    paidCount: int(row?.paid_count),
    sentCount: int(row?.sent_count),
    invoiceCount: int(row?.invoice_count),
    clientCount,
  }
}
interface RangeSpec {
  granularity: 'day' | 'month'
  from: string
  to: string
  /** Month labels only need the year when the range spans more than one. */
  showYear: boolean
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Shifts a `YYYY-MM-01` string by whole months without touching Date arithmetic. */
function addMonths(iso: string, delta: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7)) - 1 + delta
  const shiftedYear = year + Math.floor(month / 12)
  const shiftedMonth = ((month % 12) + 12) % 12
  return `${shiftedYear}-${String(shiftedMonth + 1).padStart(2, '0')}-01`
}

function rangeSpec(range: IncomeRange, today = todayIsoDate()): RangeSpec {
  switch (range) {
    case 'last_30_days':
      return { granularity: 'day', from: addDaysToIsoDate(today, -29), to: today, showYear: false }
    case 'this_year':
      return { granularity: 'month', from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-01`, showYear: false }
    case 'last_12_months':
      return { granularity: 'month', from: addMonths(firstOfMonth(today), -11), to: firstOfMonth(today), showYear: true }
    case 'this_month':
    default:
      return { granularity: 'day', from: firstOfMonth(today), to: today, showYear: false }
  }
}

function labelFor(bucket: string, spec: RangeSpec): string {
  const month = MONTH_NAMES[Number(bucket.slice(5, 7)) - 1] ?? ''
  if (spec.granularity === 'month') {
    return spec.showYear ? `${month} ${bucket.slice(2, 4)}` : month
  }
  return `${Number(bucket.slice(8, 10))} ${month}`
}
/**
 * `generate_series` produces every bucket in the range, so a week with no
 * payments still appears as a zero on the chart instead of being skipped and
 * distorting the line. Buckets follow the database timezone (UTC on every
 * managed Postgres this deploys to).
 */
export async function getIncomeSeries(
  userId: string,
  range: IncomeRange = 'this_month',
): Promise<DashboardData['income']> {
  const spec = rangeSpec(range)
  // Interpolated from the whitelist above, never from request input.
  const step = spec.granularity === 'day' ? "interval '1 day'" : "interval '1 month'"
  const seriesStart = spec.granularity === 'day' ? '$2::date' : "date_trunc('month', $2::date)"
  const seriesEnd = spec.granularity === 'day' ? '$3::date' : "date_trunc('month', $3::date)"

  const { rows } = await query<{ bucket: string; amount: string }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS bucket,
            coalesce(sum(i.total), 0)::text AS amount
       FROM generate_series(${seriesStart}, ${seriesEnd}, ${step}) d
       LEFT JOIN invoices i
              ON i.user_id = $1
             AND i.status = 'paid'
             AND i.archived_at IS NULL
             AND i.paid_at >= d
             AND i.paid_at <  d + ${step}
      GROUP BY d
      ORDER BY d ASC`,
    [userId, spec.from, spec.to],
  )

  const points: IncomePoint[] = rows.map((row) => ({
    date: text(row.bucket),
    label: labelFor(text(row.bucket), spec),
    amount: money(row.amount),
  }))

  return {
    range,
    granularity: spec.granularity,
    points,
    total: points.reduce((sum, point) => sum + point.amount, 0),
  }
}
/** Days until the due date at which an invoice starts appearing in the list. */
const ATTENTION_WINDOW_DAYS = 7

/**
 * Overdue invoices first, then anything falling due this week — the short list
 * the user can actually act on, each row carrying what the Remind button needs.
 */
export async function getNeedsAttention(userId: string, limit = 5): Promise<NeedsAttentionItem[]> {
  const { rows } = await query(
    `SELECT i.id, i.invoice_number, cl.name AS client_name, cl.email AS client_email,
            i.total::text AS amount, i.currency,
            i.due_date::text AS due_date,
            greatest(0, CURRENT_DATE - i.due_date)::int AS days_overdue,
            invoice_display_status(i.status, i.due_date, i.paid_at) AS display_status,
            i.reminder_count, i.reminder_sent_at,
            (i.public_token IS NOT NULL) AS has_public_link
       FROM invoices i
       JOIN clients cl ON cl.id = i.client_id
      WHERE i.user_id = $1
        AND i.archived_at IS NULL
        AND i.status = 'sent'
        AND i.due_date <= CURRENT_DATE + $3::int
      ORDER BY i.due_date ASC, i.total DESC
      LIMIT $2`,
    [userId, limit, ATTENTION_WINDOW_DAYS],
  )

  return rows.map((row) => ({
    id: text(row.id),
    invoiceNumber: text(row.invoice_number),
    clientName: text(row.client_name),
    clientEmail: text(row.client_email),
    amount: money(row.amount),
    currency: text(row.currency, 'INR'),
    dueDate: text(row.due_date).slice(0, 10),
    daysOverdue: int(row.days_overdue),
    displayStatus: text(row.display_status, 'sent') as DisplayStatus,
    reminderCount: int(row.reminder_count),
    reminderSentAt: ts(row.reminder_sent_at),
    hasPublicLink: row.has_public_link === true || row.has_public_link === 't',
  }))
}

/** One call for the whole dashboard screen. */
export async function getDashboardData(userId: string, range: IncomeRange = 'this_month'): Promise<DashboardData> {
  const [stats, income, needsAttention, recentInvoices] = await Promise.all([
    getDashboardStats(userId),
    getIncomeSeries(userId, range),
    getNeedsAttention(userId),
    listRecentInvoices(userId, 5),
  ])
  return { stats, income, needsAttention, recentInvoices }
}

