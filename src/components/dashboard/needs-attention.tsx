'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Bell, CheckCircle2 } from 'lucide-react'
import { ReminderDialog } from '@/components/invoices/reminder-dialog'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { dueDescription } from '@/lib/invoice/status'
import { formatDate, pluralise } from '@/lib/utils'
import type { NeedsAttentionItem } from '@/types'

/**
 * The short, actionable list: overdue first, then whatever falls due this week.
 *
 * Remind is right here rather than two navigations away, because the whole point
 * of the panel is that the user can clear it without going anywhere.
 */
function NeedsAttention({ items }: { items: NeedsAttentionItem[] }) {
  const [reminding, setReminding] = useState<NeedsAttentionItem | null>(null)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <p className="text-[13px] text-muted-foreground">
          {items.length > 0
            ? `${pluralise(items.length, 'invoice')} overdue or due within a week`
            : 'Overdue invoices and anything due this week'}
        </p>
      </CardHeader>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8 pt-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-success-subtle text-success">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium">Nothing to chase</p>
          <p className="mt-1 max-w-[16rem] text-[13px] leading-relaxed text-muted-foreground">
            No invoice is overdue and none falls due in the next seven days.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((item) => {
            const dueLabel = dueDescription({ status: 'sent', dueDate: item.dueDate })
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/invoices/${item.id}`}
                      className="tabular truncate text-[13px] font-semibold transition-colors hover:text-primary"
                    >
                      {item.invoiceNumber}
                    </Link>
                    <StatusPill status={item.displayStatus} size="sm" />
                  </div>
                  <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                    {item.clientName} · {dueLabel} · due {formatDate(item.dueDate, 'short')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="tabular text-[13px] font-semibold">{formatMoney(item.amount, item.currency)}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReminding(item)}
                    disabled={!item.clientEmail}
                    title={item.clientEmail ? undefined : 'This client has no email address'}
                  >
                    <Bell />
                    Remind
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {reminding ? (
        <ReminderDialog
          open
          onOpenChange={(open) => {
            if (!open) setReminding(null)
          }}
          invoice={{
            id: reminding.id,
            invoiceNumber: reminding.invoiceNumber,
            clientName: reminding.clientName,
            clientEmail: reminding.clientEmail,
            amount: reminding.amount,
            currency: reminding.currency,
            dueLabel: dueDescription({ status: 'sent', dueDate: reminding.dueDate }),
            reminderCount: reminding.reminderCount,
          }}
        />
      ) : null}
    </Card>
  )
}

export { NeedsAttention }
