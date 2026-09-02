import {
  BellRing,
  CircleCheck,
  Copy,
  Eye,
  FilePlus2,
  Link2,
  Link2Off,
  Pencil,
  RefreshCw,
  Send,
} from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { cn, formatDateTime, pluralise } from '@/lib/utils'
import type { InvoiceEvent } from '@/types'

export interface InvoiceTimelineProps {
  events: InvoiceEvent[]
  /** Fallback for older payment events recorded without their own currency. */
  currency: string
  className?: string
}

interface Described {
  icon: React.ReactNode
  title: string
  detail?: string
  tone?: 'success' | 'danger'
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * One event, in words a freelancer would use.
 *
 * The metadata each event carries is written by the repository that recorded it,
 * so the keys read here are the keys written there - but a row is history and
 * history outlives its schema, so every read is defensive and every detail line
 * is optional. An event with metadata that no longer parses still shows its
 * title and its timestamp.
 */
function describe(event: InvoiceEvent, currency: string): Described {
  const meta = event.metadata ?? {}

  switch (event.type) {
    case 'created': {
      const from = str(meta.duplicatedFrom)
      const items = num(meta.itemCount)
      return {
        icon: <FilePlus2 />,
        title: from ? 'Created as a copy' : 'Invoice created',
        detail: from
          ? `Duplicated from ${from}`
          : items === null
            ? undefined
            : `${pluralise(items, 'line item')}`,
      }
    }

    case 'updated': {
      const items = num(meta.itemCount)
      return {
        icon: <Pencil />,
        title: meta.afterSend === true ? 'Edited after sending' : 'Invoice edited',
        detail:
          meta.afterSend === true
            ? 'The client may be holding an older copy.'
            : items === null
              ? undefined
              : `${pluralise(items, 'line item')}`,
      }
    }

    case 'sent': {
      const to = str(meta.to)
      const manual = str(meta.via) === 'manual'
      const again = meta.resend === true
      return {
        icon: <Send />,
        title: manual ? 'Marked as sent' : again ? 'Sent again' : 'Sent to client',
        detail: manual
          ? 'Recorded without an email - shared by link or by hand.'
          : (to ?? undefined),
      }
    }

    case 'viewed':
      return {
        icon: <Eye />,
        title: 'Opened by the client',
        detail: 'They loaded the payment link.',
      }

    case 'reminder_sent': {
      const count = num(meta.count)
      return {
        icon: <BellRing />,
        title: 'Reminder sent',
        detail: count && count > 1 ? `Reminder number ${count}` : undefined,
      }
    }

    case 'link_revoked':
      return {
        icon: <Link2Off />,
        title: 'Payment link revoked',
        detail: 'The old URL stopped working.',
        tone: 'danger',
      }

    case 'link_regenerated':
      return {
        icon: <RefreshCw />,
        title: 'New payment link issued',
        detail: 'The previous URL stopped working.',
      }

    case 'payment_received': {
      const amount = num(meta.amount)
      const method = str(meta.method)
      const reference = str(meta.reference)
      const label =
        method === 'card' ? 'by card' : method === 'bank_transfer' ? 'by bank transfer' : 'by hand'
      return {
        icon: <CircleCheck />,
        title:
          amount === null
            ? 'Paid in full'
            : `${formatMoney(amount, str(meta.currency) ?? currency)} received`,
        detail: reference ? `Paid ${label} · ${reference}` : `Paid ${label}`,
        tone: 'success',
      }
    }

    case 'duplicated': {
      const number = str(meta.newInvoiceNumber)
      return {
        icon: <Copy />,
        title: 'Copied to a new invoice',
        detail: number ? `${number} was created from this one.` : undefined,
      }
    }
  }

  // Unreachable for the current union, and deliberately here anyway: an event
  // written by a later version of the app should still appear in the history.
  return { icon: <Link2 />, title: 'Activity recorded' }
}

const TONES = {
  success: 'border-success-border bg-success-subtle text-success',
  danger: 'border-danger-border bg-danger-subtle text-danger',
  neutral: 'border-border bg-muted text-muted-foreground',
} as const

/**
 * What has happened to this invoice, newest first.
 *
 * This is the answer to "did they ever open it?" - the question that decides
 * whether chasing payment means a reminder or a phone call. Every row is written
 * by the server as a side effect of the action it describes, so the feed is a
 * record rather than a reconstruction: nothing here can disagree with the
 * invoice it belongs to.
 *
 * Timestamps are exact rather than relative. "3 days ago" is friendlier, but a
 * payment history is the wrong place to make someone do arithmetic.
 */
function InvoiceTimeline({ events, currency, className }: InvoiceTimelineProps) {
  if (events.length === 0) {
    return (
      <p className={cn('text-[13px] text-muted-foreground', className)}>
        Nothing has happened to this invoice yet.
      </p>
    )
  }

  return (
    <ol className={cn('grid', className)}>
      {events.map((event, index) => {
        const { icon, title, detail, tone } = describe(event, currency)

        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index === events.length - 1 ? null : (
              <span aria-hidden className="absolute bottom-0 left-4 top-8 w-px -translate-x-1/2 bg-border" />
            )}

            <span
              aria-hidden
              className={cn(
                'relative grid size-8 shrink-0 place-items-center rounded-full border [&_svg]:size-3.5',
                TONES[tone ?? 'neutral'],
              )}
            >
              {icon}
            </span>

            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[13px] font-medium leading-snug">{title}</p>
              {detail ? <p className="mt-0.5 break-words text-2xs text-muted-foreground">{detail}</p> : null}
              <p className="tabular mt-0.5 text-2xs text-muted-foreground/80">{formatDateTime(event.createdAt)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export { InvoiceTimeline }
