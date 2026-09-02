import { MobileTabBar, MobileTopBar } from '@/components/shell/mobile-nav'
import { Sidebar } from '@/components/shell/sidebar'
import { requireUserPage } from '@/lib/auth'
import { getSettings } from '@/lib/repositories/settings'

/**
 * The signed-in shell.
 *
 * The session is resolved here rather than in each page, so a signed-out visitor
 * cannot reach any screen in this group even if the middleware cookie check is
 * bypassed — `requireUserPage()` queries the sessions table and redirects.
 *
 * `pb-24 lg:pb-8` leaves room for the fixed phone tab bar; without it the last
 * row of a list sits underneath it and looks cut off.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage()
  const settings = await getSettings(user.id)
  const businessName = settings.businessName || user.fullName || 'Your business'

  return (
    <div className="min-h-dvh">
      <Sidebar user={user} businessName={businessName} />
      <MobileTopBar user={user} businessName={businessName} />

      <div className="lg:pl-[248px]">
        <main className="page-enter mx-auto w-full max-w-[1180px] px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  )
}
