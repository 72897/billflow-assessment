'use client'

import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'

/**
 * A failure on the public link, seen by someone who cannot open a support ticket.
 *
 * So the copy does two things the in-app error page does not need to: it says the
 * invoice itself is fine (nothing they owe has changed), and it tells them what to
 * do if it keeps failing - reply to the person who sent the link. `reset()` re-runs
 * the server component, which is usually all a transient database blip needs.
 */
export default function PublicInvoiceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Public invoice failed', error.digest ?? '', error)
  }, [error])

  return (
    <Card>
      <ErrorState
        title="This invoice did not load"
        description="Something went wrong on our side - the invoice itself is unaffected. Try again, and if it keeps failing, reply to the email this link came from."
        onRetry={reset}
      />
      {error.digest ? (
        <p className="border-t border-border px-5 py-3 text-center text-2xs text-muted-foreground">
          Reference <span className="tabular font-medium text-foreground">{error.digest}</span>
        </p>
      ) : null}
    </Card>
  )
}
