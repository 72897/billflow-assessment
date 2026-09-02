import Link from 'next/link'
import { ArrowRight, Check, Clock, FileText, Plus, Send, Wallet } from 'lucide-react'
import { Logo } from '@/components/shell/logo'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSessionUser } from '@/lib/auth'
import { APP_NAME } from '@/lib/config'
import { formatMoneySymbol } from '@/lib/money'

export const metadata = {
  title: { absolute: `${APP_NAME} - Invoicing that gets you paid` },
  description:
    'Create professional invoices, send them as a link your client can pay without signing in, and watch what is paid, outstanding and overdue on one dashboard.',
}

const HIGHLIGHTS = [
  {
    icon: FileText,
    title: 'Create',
    body: 'Unlimited line items, per-invoice tax and discount, and totals that recalculate as you type. Your prefix and next number are applied for you.',
  },
  {
    icon: Send,
    title: 'Send',
    body: 'Email the invoice or hand over a private link. Your client opens it in a browser - no account, no app, no PDF attachment to lose.',
  },
  {
    icon: Clock,
    title: 'Track',
    body: 'Draft, sent, paid - and overdue the moment a due date passes, without anyone remembering to change it. Every send, view and reminder is logged.',
  },
  {
    icon: Wallet,
    title: 'Get paid',
    body: 'One tap on the public page settles the invoice, stamps the paid date and updates your dashboard and client totals in the same breath.',
  },
]

const STEPS = [
  { title: 'Add a client', body: 'Name and email is enough to start. Everything else can wait.' },
  { title: 'Build the invoice', body: 'Line items, tax, discount, notes. The total is always live at the bottom.' },
  { title: 'Share and get paid', body: 'Send it, then watch the status change from sent to paid on its own.' },
]

/**
 * A static illustration of a real invoice, using the same money formatter the
 * app uses, so the marketing preview cannot drift from what the product renders.
 * The figures below follow the documented order of operations: subtotal, then
 * discount, then tax on what is left.
 */
const PREVIEW_ITEMS = [
  { description: 'Brand identity system', detail: '1 × 48,000', amount: 4_800_000 },
  { description: 'Landing page design', detail: '1 × 32,000', amount: 3_200_000 },
  { description: 'Design QA', detail: '6 hrs × 1,500', amount: 900_000 },
]

function InvoicePreview() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/[0.08] text-[13px] font-semibold text-primary">
            AD
          </div>
          <p className="mt-2.5 text-sm font-semibold">Aria Design Studio</p>
          <p className="text-2xs text-muted-foreground">studio@ariadesign.in</p>
        </div>
        <StatusPill status="paid" />
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Billed to</p>
          <p className="text-[13px] font-medium">Northwind Traders</p>
          <p className="text-2xs text-muted-foreground">Issued 12 Aug · Due 26 Aug 2026</p>
        </div>
        <div className="text-right">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Invoice</p>
          <p className="tabular text-[13px] font-semibold">INV-0042</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {PREVIEW_ITEMS.map((item) => (
          <li key={item.description} className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.description}</span>
              <span className="text-2xs text-muted-foreground">{item.detail}</span>
            </span>
            <span className="tabular shrink-0 text-muted-foreground">{formatMoneySymbol(item.amount)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular">{formatMoneySymbol(8_900_000)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Discount (5%)</dt>
          <dd className="tabular text-success">−{formatMoneySymbol(445_000)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">GST 18%</dt>
          <dd className="tabular">{formatMoneySymbol(1_521_900)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2.5">
          <dt className="font-semibold">Total</dt>
          <dd className="tabular text-base font-semibold">{formatMoneySymbol(9_976_900)}</dd>
        </div>
      </dl>

      <p className="mt-4 flex items-center gap-1.5 rounded-md bg-success-subtle px-2.5 py-2 text-2xs font-medium text-success">
        <Check className="size-3.5 shrink-0" aria-hidden />
        Paid 19 Aug 2026 · reference PAY-8c31f0a2
      </p>
    </div>
  )
}

/**
 * The landing page answers to the session.
 *
 * Someone already signed in has no use for "Sign in" and "Create account" - the
 * middleware would only bounce them off /login again - so the same page offers
 * the way back into the app instead. Reading the cookie makes this route
 * dynamic, which is the right trade: a marketing page that contradicts the
 * user's own state looks broken in a way a cache hit does not repay.
 */
export default async function LandingPage() {
  const user = await getSessionUser()
  const signedIn = user !== null

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Logo href="/" />
          <nav className="flex items-center gap-2" aria-label="Account">
            {signedIn ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  Go to dashboard
                  <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-2xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                Built for freelancers and studios
              </p>

              <h1 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[44px] lg:text-[52px]">
                Invoices without the spreadsheet chaos.
              </h1>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                {APP_NAME} turns billing into three minutes of work: build the invoice, send a link your client can pay
                without signing in, and see exactly what you have earned, what is outstanding and what has slipped past
                its due date.
              </p>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                {signedIn ? (
                  <>
                    <Button asChild size="lg">
                      <Link href="/dashboard">
                        Go to dashboard
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="lg">
                      <Link href="/invoices/new">
                        <Plus />
                        New invoice
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild size="lg">
                      <Link href="/signup">
                        Start invoicing
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="lg">
                      <Link href="/login?demo=1">View demo</Link>
                    </Button>
                  </>
                )}
              </div>

              <p className="mt-4 text-2xs leading-relaxed text-muted-foreground">
                {signedIn
                  ? 'You are signed in. Your dashboard has what is earned, outstanding and overdue right now.'
                  : 'Free while you send your first invoices. No card, no setup call.'}
              </p>
            </div>

            <div className="lg:pl-2">
              <InvoicePreview />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 sm:py-16">
            <h2 className="max-w-2xl text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">
              Everything between “I finished the work” and “the money arrived”.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-background p-5">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary/[0.08] text-primary">
                    <item.icon className="size-[18px]" aria-hidden />
                  </div>
                  <h3 className="mt-3.5 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">Three steps, start to paid</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t-2 border-primary/25 pt-4">
                <span className="tabular text-2xs font-semibold text-primary">STEP {index + 1}</span>
                <h3 className="mt-1.5 text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-14">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                {signedIn ? 'Pick up where you left off' : 'Send your first invoice today'}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">
                {signedIn
                  ? 'Everything you have billed is a click away, with overdue kept current on its own.'
                  : 'No card, no setup call. An account and a client is all it takes.'}
              </p>
            </div>
            <Button asChild size="lg" className="sm:shrink-0">
              {signedIn ? (
                <Link href="/invoices">
                  View your invoices
                  <ArrowRight />
                </Link>
              ) : (
                <Link href="/signup">
                  Create your account
                  <ArrowRight />
                </Link>
              )}
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-7 text-2xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Logo href="/" markOnly size="sm" />
            <span>
              © {new Date().getFullYear()} {APP_NAME}. Invoicing for freelancers and small studios.
            </span>
          </div>
          <div className="flex items-center gap-4">
            {signedIn ? (
              <>
                <Link href="/dashboard" className="transition-colors hover:text-foreground">
                  Dashboard
                </Link>
                <Link href="/invoices" className="transition-colors hover:text-foreground">
                  Invoices
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Sign in
                </Link>
                <Link href="/signup" className="transition-colors hover:text-foreground">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
