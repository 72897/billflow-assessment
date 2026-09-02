'use client'

import { Eye, ExternalLink, Link2, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CopyButton } from '@/components/ui/copy-button'
import { FormError } from '@/components/ui/error-state'
import { toast } from '@/components/ui/toaster'
import { api, errorMessage } from '@/lib/api/client'
import { formatRelative, pluralise } from '@/lib/utils'
import type { InvoiceDetail } from '@/types'

export interface ShareLinkCardProps {
  invoice: Pick<InvoiceDetail, 'id' | 'invoiceNumber' | 'viewCount' | 'lastViewedAt'>
  /** The live link, built on the server so it carries the deployed origin. */
  shareUrl: string | null
}

type Action = 'create' | 'revoke' | 'regenerate'

/**
 * The login-free link a client pays from.
 *
 * The token in the URL *is* the credential, so the three actions here are the
 * whole of its lifecycle: mint one, rotate it when it has been pasted somewhere
 * regrettable, or revoke it so the URL 404s. Both destructive actions ask first
 * and say what breaks, because the link may already be sitting in someone's
 * inbox (SHR-04).
 *
 * Sending an invoice mints a link on its own, so most invoices arrive here with
 * one already; the create button is for sharing without emailing.
 */
function ShareLinkCard({ invoice, shareUrl }: ShareLinkCardProps) {
  const router = useRouter()
  const [url, setUrl] = useState(shareUrl)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'revoke' | 'regenerate' | null>(null)

  // The server stays the authority: a refresh after any mutation re-seeds this.
  useEffect(() => setUrl(shareUrl), [shareUrl])

  async function run(action: Action) {
    setBusy(action)
    setError(null)
    try {
      const data = await api.post<{ action: Action; token: string | null; shareUrl: string | null }>(
        `/api/invoices/${invoice.id}/public-link`,
        { action },
      )
      setUrl(data.shareUrl)
      if (action === 'revoke') {
        toast.success('Payment link revoked', { description: 'Anyone opening the old link now sees nothing.' })
      } else if (action === 'regenerate') {
        toast.success('New payment link created', { description: 'The previous link has stopped working.' })
      } else {
        toast.success('Payment link created')
      }
      setConfirming(null)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          Payment link
        </CardTitle>
        <CardDescription>
          {url
            ? 'Anyone with this link can view and pay this invoice. No account needed.'
            : 'Share this invoice without emailing it - useful for WhatsApp or a chat thread.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-3">
        <FormError message={error} />

        {url ? (
          <>
            <p className="break-all rounded-md border border-border bg-muted/50 px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
              {url}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={url} label="Copy link" toastMessage="Payment link copied" />
              <Button asChild variant="ghost" size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open
                </a>
              </Button>
            </div>

            <p className="flex items-center gap-1.5 border-t border-border pt-3 text-2xs text-muted-foreground">
              <Eye className="size-3.5 shrink-0" aria-hidden />
              {invoice.viewCount > 0
                ? `Opened ${pluralise(invoice.viewCount, 'time')} · last ${formatRelative(invoice.lastViewedAt)}`
                : 'Not opened yet'}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming('regenerate')} disabled={busy !== null}>
                <RefreshCw />
                New link
              </Button>
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirming('revoke')} disabled={busy !== null}>
                <Trash2 />
                Revoke
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            loading={busy === 'create'}
            // The reason is already in `error`; swallowing keeps a failed click
            // from surfacing as an unhandled rejection.
            onClick={() => void run('create').catch(() => undefined)}
          >
            <Link2 />
            Create payment link
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => setConfirming(next ? confirming : null)}
        title={confirming === 'revoke' ? 'Revoke this payment link?' : 'Issue a new payment link?'}
        description={
          confirming === 'revoke'
            ? `The link stops working straight away. ${invoice.invoiceNumber} stays exactly as it is, but nobody can open it until you create a new link.`
            : 'The current link stops working and a fresh one takes its place. Anyone holding the old one will need the new URL.'
        }
        confirmLabel={confirming === 'revoke' ? 'Revoke link' : 'Create new link'}
        tone={confirming === 'revoke' ? 'danger' : 'primary'}
        onConfirm={() => run(confirming === 'revoke' ? 'revoke' : 'regenerate')}
      />
    </Card>
  )
}

export { ShareLinkCard }



