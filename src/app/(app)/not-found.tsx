import { FileQuestion } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Not found' }

/**
 * The in-shell 404, for `notFound()` thrown by a client or invoice page.
 *
 * Without this boundary the root `not-found.tsx` takes over the whole viewport and
 * the signed-in user loses the sidebar — which reads like being logged out rather
 * than like following a dead link. Here the navigation stays put and only the
 * content area says "gone".
 *
 * A deleted id and another user's id land in the same place on purpose: the
 * repositories scope ownership in SQL, so a foreign id is simply not found and the
 * 404 cannot be used to test which ids exist.
 */
export default function AppNotFound() {
  return (
    <Card>
      <EmptyState
        icon={<FileQuestion />}
        title="We could not find that"
        description="The link may be out of date, or the invoice or client it pointed at may have been deleted."
        action={
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="secondary">
            <Link href="/invoices">View invoices</Link>
          </Button>
        }
      />
    </Card>
  )
}
