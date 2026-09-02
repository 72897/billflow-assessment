import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { APP_NAME, APP_TAGLINE, appUrl } from '@/lib/config'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

/**
 * Self-hosted by Next at build time, so the first paint never waits on a
 * request to Google and the layout cannot shift when the font arrives.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: `${APP_NAME} - ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'BillFlow is invoicing for freelancers and small studios: send a professional invoice in a minute, share a payment link, and see what you are owed at a glance.',
  applicationName: APP_NAME,
  openGraph: {
    title: `${APP_NAME} - ${APP_TAGLINE}`,
    description: 'Create invoices, share a payment link, and get paid faster.',
    siteName: APP_NAME,
    type: 'website',
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
