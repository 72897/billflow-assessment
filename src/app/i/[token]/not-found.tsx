import { Link2Off } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Invoice not available', robots: { index: false, follow: false } }

/**
 * A share link that no longer resolves.
 *
 * Four different situations land here — the token was revoked, the invoice was
 * archived, the link was mistyped, or it never existed — and they are deliberately
 * indistinguishable. Anything more specific would let someone probe for live
 * tokens by watching how the wording changes.
 *
 * There is no "back to dashboard" button, because whoever is reading this has no
 * dashboard. The only useful next step is to ask the sender for a fresh link.
 */
export default function PublicInvoiceNotFound() {
  return (
    <Card>
      <EmptyState
        icon={<Link2Off />}
        title="This invoice link is no longer active"
        description="The link may have expired, been replaced with a newer one, or the invoice may have been withdrawn. Reply to the email it came from and ask for an up-to-date link."
      />
    </Card>
  )
}
