'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/error-state'

/**
 * Catches a render or data failure anywhere inside the signed-in shell.
 *
 * `reset()` re-renders the segment, which retries the server component's queries
 * - so a transient database hiccup recovers without the user losing their place
 * in the app.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server component errors reach the browser with their message stripped in
    // production; the digest is the only way to tie this screen to a server log.
    console.error('App segment failed', error.digest ?? '', error)
  }, [error])

  return (
    <div className="rounded-lg border border-border bg-card shadow-card">
      <ErrorState
        title="This screen did not load"
        description="Something went wrong on our side. Trying again usually clears it - nothing you have saved is affected."
        onRetry={reset}
      />
      {error.digest ? (
        <p className="border-t border-border px-5 py-3 text-center text-2xs text-muted-foreground">
          Reference <span className="tabular font-medium text-foreground">{error.digest}</span>
        </p>
      ) : null}
    </div>
  )
}
