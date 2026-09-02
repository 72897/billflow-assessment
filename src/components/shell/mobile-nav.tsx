'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/shell/logo'
import { NAV_ITEMS, isActivePath } from '@/components/shell/nav-items'
import { UserMenu } from '@/components/shell/user-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/lib/auth/session'

/**
 * The phone header: brand, one primary action, account.
 *
 * Sticky rather than fixed, so it scrolls with a long list on iOS instead of
 * fighting the browser chrome for the same strip of screen.
 */
function MobileTopBar({ user, businessName }: { user: SessionUser; businessName: string }) {
  return (
    <header
      data-app-nav
      className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden"
    >
      <Logo href="/dashboard" size="sm" />
      <div className="flex items-center gap-1.5">
        <Button asChild size="sm">
          <Link href="/invoices/new">
            <Plus />
            New
          </Link>
        </Button>
        <UserMenu user={user} businessName={businessName} compact />
      </div>
    </header>
  )
}

/**
 * The phone tab bar.
 *
 * Four destinations, thumb-height, and padded for the iOS home indicator with
 * `env(safe-area-inset-bottom)` so the last row of a list is never trapped
 * behind it. Pages add matching bottom padding.
 */
function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      data-app-nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="flex items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-5" />
              {item.shortLabel ?? item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export { MobileTabBar, MobileTopBar }
