import Link from 'next/link'
import { Logo } from '@/components/shell/logo'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/config'

/**
 * The frame around a shared invoice - Screen 17's shell.
 *
 * Deliberately not the app shell: whoever opens this link has no account, so a
 * sidebar full of dashboards they cannot reach would only be confusing. What is
 * left is the document on a tinted background, one quiet line of BillFlow
 * branding, and nothing that looks like a login wall.
 *
 * Both the header and the footer are `no-print`, so Ctrl-P here produces the
 * invoice on its own rather than a screenshot of a web page.
 */
export default function PublicInvoiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40 print:bg-transparent">
      <header className="no-print flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <Logo href="/" size="sm" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/signup">Create your own invoices</Link>
        </Button>
      </header>

      <main className="flex-1 px-4 pb-14 sm:px-6">
        <div className="print-plain mx-auto w-full max-w-[840px]">{children}</div>
      </main>

      <footer className="no-print border-t border-border px-4 py-5 text-center text-2xs text-muted-foreground sm:px-6">
        Sent with{' '}
        <Link href="/" className="font-medium text-foreground underline-offset-2 hover:underline">
          {APP_NAME}
        </Link>{' '}
        - invoicing that gets you paid.
      </footer>
    </div>
  )
}
