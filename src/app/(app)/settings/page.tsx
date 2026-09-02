import { ImageIcon, Mail, UserRound } from 'lucide-react'
import { LogoUploader } from '@/components/settings/logo-uploader'
import { SettingsForm } from '@/components/settings/settings-form'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUserPage } from '@/lib/auth'
import { getSettings, peekInvoiceNumber } from '@/lib/repositories/settings'

export const metadata = { title: 'Settings' }

/**
 * Screen 13 — settings.
 *
 * Three cards, in the order they matter: who you are on paper, the logo that sits
 * above it, and the numbering and defaults every new invoice inherits. The logo
 * saves on upload while the rest saves on submit, which is why it is a card of its
 * own rather than a field in the form — a file picker that silently waits for a
 * Save button is a file picker people think is broken.
 */
export default async function SettingsPage() {
  const user = await requireUserPage('/settings')
  const [settings, nextInvoiceNumber] = await Promise.all([getSettings(user.id), peekInvoiceNumber(user.id)])

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, branding and invoice defaults — everything an invoice inherits when you create it."
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
              Logo
            </CardTitle>
            <CardDescription>
              Sits at the top of every invoice and receipt. Saved the moment you upload it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LogoUploader logoUrl={settings.logoUrl} businessName={settings.businessName} />
          </CardContent>
        </Card>

        <SettingsForm settings={settings} nextInvoiceNumber={nextInvoiceNumber} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-muted-foreground" aria-hidden />
              Account
            </CardTitle>
            <CardDescription>The login this workspace belongs to. Every client and invoice is private to it.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <dt className="sr-only">Name</dt>
                <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="font-medium">{user.fullName || 'No name set'}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="sr-only">Email</dt>
                <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="break-all font-medium">{user.email}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
