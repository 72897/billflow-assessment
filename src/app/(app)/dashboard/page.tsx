import Link from 'next/link'
import { ArrowRight, FileText, Plus, Users } from 'lucide-react'
import { AiBrief } from '@/components/dashboard/ai-brief'
import { IncomeChart } from '@/components/dashboard/income-chart'
import { NeedsAttention } from '@/components/dashboard/needs-attention'
import { StatCards } from '@/components/dashboard/stat-cards'
import { InvoiceTable } from '@/components/invoices/invoice-table'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeaderRow, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { briefContextFrom, briefFromRules } from '@/lib/ai/dashboard-brief'
import { hasAiProvider } from '@/lib/ai/groq'
import { requireUserPage } from '@/lib/auth'
import { todayIsoDate } from '@/lib/invoice/status'
import { getDashboardData } from '@/lib/repositories/dashboard'
import { pluralise } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }

/**
 * The dashboard renders on the server: three aggregate queries and two small
 * lists, which is far less work than shipping the invoice table to the browser
 * and summing it there. Only the chart's range switcher needs client JavaScript.
 */
export default async function DashboardPage() {
  const user = await requireUserPage('/dashboard')
  const { stats, income, needsAttention, recentInvoices } = await getDashboardData(user.id)

  const firstName = user.fullName.trim().split(/\s+/)[0] || null
  const brandNew = stats.invoiceCount === 0

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        description={
          brandNew
            ? 'Two steps to your first invoice: add a client, then bill them.'
            : `${pluralise(stats.invoiceCount, 'invoice')} · ${pluralise(stats.clientCount, 'client')}`
        }
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus />
              New invoice
            </Link>
          </Button>
        }
      />

      {brandNew ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/[0.08] text-primary">
              <Users className="size-[18px]" aria-hidden />
            </span>
            <h2 className="mt-3.5 text-sm font-semibold">1 · Add your first client</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              A name and an email is enough. Company, phone and address can follow later.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <Link href="/clients/new">
                Add a client
                <ArrowRight />
              </Link>
            </Button>
          </Card>

          <Card className="p-5">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/[0.08] text-primary">
              <FileText className="size-[18px]" aria-hidden />
            </span>
            <h2 className="mt-3.5 text-sm font-semibold">2 · Bill them</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Add line items, set a due date, then send it as a link your client can pay without signing in.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <Link href="/invoices/new">
                Create an invoice
                <ArrowRight />
              </Link>
            </Button>
          </Card>

          <Card className="p-5 sm:col-span-2">
            <h2 className="text-sm font-semibold">Make it yours first</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Your business name, logo, currency and invoice number prefix all appear on every invoice you send. They
              take a minute to set and apply from your next invoice onwards.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <Link href="/settings">Open settings</Link>
            </Button>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5">
          {/*
           * Explained on the server from the same figures the cards show, so the
           * summary is on screen with them rather than a second later. The client
           * asks the model to rewrite it only when a key is configured.
           */}
          <AiBrief
            initial={briefFromRules(briefContextFrom(stats, needsAttention, todayIsoDate()))}
            upgradable={hasAiProvider()}
          />

          <StatCards stats={stats} />

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.35fr_1fr]">
            <IncomeChart income={income} currency={stats.currency} />
            <NeedsAttention items={needsAttention} />
          </div>

          <Card>
            <CardHeaderRow>
              <div>
                <CardTitle>Recent invoices</CardTitle>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Your five most recent, newest first.</p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/invoices">
                  View all
                  <ArrowRight />
                </Link>
              </Button>
            </CardHeaderRow>

            {recentInvoices.length === 0 ? (
              <EmptyState
                className="border-t border-border"
                icon={<FileText />}
                title="No invoices yet"
                description="Your invoices will show up here as soon as you create one."
                action={
                  <Button asChild size="sm">
                    <Link href="/invoices/new">
                      <Plus />
                      New invoice
                    </Link>
                  </Button>
                }
              />
            ) : (
              <InvoiceTable invoices={recentInvoices} className="border-t border-border" />
            )}
          </Card>
        </div>
      )}
    </>
  )
}
