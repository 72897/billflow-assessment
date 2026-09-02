import { Mail, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { PaymentPanel } from '@/components/public/payment-panel'
import { findPublicInvoice, recordPublicView } from '@/lib/repositories/public'

/**
 * The share token is the whole credential, so the answer must never come from a
 * cache: a revoked link has to stop working on the next request, and a payment
 * made a second ago has to be visible on a refresh.
 */
export const revalidate = 0

/** Deduped so `generateMetadata` and the page body cost one query, not two. */
const load = cache((token: string) => findPublicInvoice(token))

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const invoice = await load(token)

  if (!invoice) {
    return { title: 'Invoice not available', robots: { index: false, follow: false } }
  }

  const title = `Invoice ${invoice.invoiceNumber} from ${invoice.business.businessName || 'your supplier'}`

  return {
    title,
    description: 'View this invoice and pay it online — no account needed.',
    // A share link is a bearer credential. Indexing one would publish it, so
    // every crawler is told to stay away and previews carry no amount.
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title, description: 'View this invoice and pay it online.', type: 'website' },
  }
}

/**
 * Screen 17 — the public invoice.
 *
 * No session, no sidebar, no sign-up wall: a client who has been sent a link
 * should be one tap from paying. The projection behind it carries no ids and no
 * internal history, so the token cannot be traded up into anything else — and
 * revoking it (nulling `public_token`) turns this page into a 404 with nothing
 * left to clean up.
 *
 * Opening the page records a view, which is what puts "Opened by the client" on
 * the owner's timeline. A refresh inside a fifteen-minute window does not count
 * again, so the number stays worth reading (SHR-06). The write happens after the
 * invoice has been found, so a crawler hitting a dead token writes nothing.
 *
 * There is deliberately no `loading.tsx` beside this file. A Suspense boundary
 * here would make Next flush the shell before the token has been looked up, and a
 * response whose headers have already gone out cannot be given a 404 — a dead
 * share link would answer 200 to every crawler and link checker. Nothing in the
 * app client-side-navigates here (every visitor arrives from an email), so the
 * skeleton it would buy is one nobody could see.
 */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await load(token)
  if (!invoice) notFound()

  await recordPublicView(token)

  const { business } = invoice
  const contactable = Boolean(business.businessEmail || business.phone)

  return (
    <div className="grid gap-4">
      <PaymentPanel
        token={token}
        invoiceNumber={invoice.invoiceNumber}
        businessName={business.businessName || 'Your supplier'}
        clientName={invoice.client.name}
        total={invoice.total}
        currency={invoice.currency}
        dueDate={invoice.dueDate}
        status={invoice.displayStatus}
        paidAt={invoice.paidAt}
        payment={invoice.payment}
      />

      <InvoiceDocument invoice={invoice} variant="page" />

      {contactable ? (
        <p className="no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2 text-center text-[13px] text-muted-foreground">
          <span>Questions about this invoice?</span>
          {business.businessEmail ? (
            <a
              href={`mailto:${business.businessEmail}?subject=${encodeURIComponent(`Invoice ${invoice.invoiceNumber}`)}`}
              className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:underline"
            >
              <Mail className="size-3.5" aria-hidden />
              {business.businessEmail}
            </a>
          ) : null}
          {business.phone ? (
            <a
              href={`tel:${business.phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:underline"
            >
              <Phone className="size-3.5" aria-hidden />
              {business.phone}
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
