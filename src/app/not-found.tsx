import Link from 'next/link'
import { Logo } from '@/components/shell/logo'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Page not found' }

/**
 * Also the destination for `notFound()` thrown by an invoice or client page whose
 * id belongs to somebody else - an "does not exist" answer and a "not yours"
 * answer must be indistinguishable, or the 404 becomes an existence oracle.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo href="/" />
      <p className="tabular mt-8 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">We could not find that page</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
        The link may be out of date, or the invoice or client it pointed at may have been deleted.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/invoices">View invoices</Link>
        </Button>
      </div>
    </div>
  )
}
