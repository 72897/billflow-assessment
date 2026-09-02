/**
 * Invoice status.
 *
 * Only three states are ever stored: draft, sent, paid. "Overdue" is derived
 * from the stored state plus today's date every time an invoice is read, so
 *
 *   - an invoice becomes overdue overnight with no cron job (INV-20), and
 *   - paying an overdue invoice clears the overdue label immediately, instead
 *     of leaving it stuck in a state somebody forgot to update.
 *
 * The SQL function `invoice_display_status()` in 0002_functions.sql implements
 * exactly the same rule, so list filters and this module cannot disagree.
 */

export type StoredStatus = 'draft' | 'sent' | 'paid'
export type DisplayStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export const STORED_STATUSES: readonly StoredStatus[] = ['draft', 'sent', 'paid']
export const DISPLAY_STATUSES: readonly DisplayStatus[] = ['draft', 'sent', 'paid', 'overdue']

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
}

export interface StatusSource {
  status: StoredStatus | string
  /** ISO date, `YYYY-MM-DD`. */
  dueDate: string
  /** ISO timestamp, or null when unpaid. */
  paidAt?: string | null
}

/**
 * `YYYY-MM-DD` for today, in UTC.
 *
 * UTC rather than the local calendar because the database is the authority on
 * what "today" means: `invoice_display_status()` compares `due_date` against
 * `current_date`, and every Postgres this deploys to runs in UTC. Deriving the
 * TypeScript side from local time instead makes the two disagree for as many
 * hours as the server is offset from UTC — an invoice that SQL calls overdue,
 * with a "due in 0 days" caption rendered beside it.
 */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function deriveDisplayStatus(source: StatusSource, today: string = todayIsoDate()): DisplayStatus {
  if (source.paidAt || source.status === 'paid') return 'paid'
  if (source.status === 'sent' && source.dueDate < today) return 'overdue'
  return source.status === 'sent' ? 'sent' : 'draft'
}

export function isOverdue(source: StatusSource, today: string = todayIsoDate()): boolean {
  return deriveDisplayStatus(source, today) === 'overdue'
}

/** Whole days between `dueDate` and today. Positive = overdue by N days. */
export function daysOverdue(dueDate: string, today: string = todayIsoDate()): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(now)) return 0
  return Math.round((now - due) / 86_400_000)
}

/** Positive = still has N days left. */
export function daysUntilDue(dueDate: string, today: string = todayIsoDate()): number {
  return -daysOverdue(dueDate, today)
}

/** "Due in 5 days" / "Due today" / "5 days overdue" / "Paid". */
export function dueDescription(source: StatusSource, today: string = todayIsoDate()): string {
  const status = deriveDisplayStatus(source, today)
  if (status === 'paid') return 'Paid'
  if (status === 'draft') return 'Not sent yet'

  const remaining = daysUntilDue(source.dueDate, today)
  if (remaining === 0) return 'Due today'
  if (remaining > 0) return remaining === 1 ? 'Due tomorrow' : `Due in ${remaining} days`
  const late = Math.abs(remaining)
  return late === 1 ? '1 day overdue' : `${late} days overdue`
}

/** Whether a draft/sent/paid invoice may still be edited freely. */
export function editPolicy(status: StoredStatus | string): 'free' | 'confirm' | 'locked' {
  if (status === 'draft') return 'free'
  if (status === 'sent') return 'confirm'
  return 'locked'
}
