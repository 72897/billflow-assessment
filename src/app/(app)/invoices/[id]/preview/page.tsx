import { ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { PrintButton } from '@/components/invoices/print-button'
import { Button } from '@/components/ui/button'
import { requireUserPage } from '@/lib/auth'
import { findInvoiceDetail } from '@/lib/repositories/invoices'

export const metadata = { title: 'Invoice preview' }

/**
 * Screen 12 — the invoice as the client will see it.
 *
 * An A4 sheet on a plain background, with the app's own chrome pushed out of the
 * way: this is the page to open before sending, and the page to hit Ctrl-P on.
 * The print rules in `globals.css` drop the toolbar and the navigation, so the
 * printed sheet and the downloaded PDF are the same document.
 */
export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUserPage(`/invoices/${id}/preview`)

  const invoice = await findInvoiceDetail(user.id, id)
  if (!invoice) notFound()

  return (
    <div className="print-plain">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/invoices/${invoice.id}`}>
            <ArrowLeft />
            Back to {invoice.invoiceNumber}
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <PrintButton size="sm" />
          <Button asChild size="sm">
            <a href={`/api/invoices/${invoice.id}/pdf?download=1`}>
              <Download />
              Download PDF
            </a>
          </Button>
        </div>
      </div>

      <InvoiceDocument invoice={invoice} variant="page" />

      <p className="no-print mt-4 text-center text-2xs text-muted-foreground">
        This is exactly what {invoice.clientName} sees on the payment link and in the PDF.
      </p>
    </div>
  )
}
