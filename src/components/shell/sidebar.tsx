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
 * The desktop rail. Fixed, so a long invoice list scrolls under it rather than
 * pushing it away, and hidden below `lg:` where the tab bar takes over.
 */
function Sidebar({ user, businessName }: { user: SessionUser; businessName: string }) {
  const pathname = usePathname()

  return (
    <aside
      data-app-nav
      className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-card lg:flex"
    >
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" />
      </div>

      <div className="px-4 pb-4">
        <Button asChild className="w-full">
          <Link href="/invoices/new">
            <Plus />
            New invoice
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/[0.07] text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className={cn('size-[18px] shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-3">
        <UserMenu user={user} businessName={businessName} align="start" side="top" />
      </div>
    </aside>
  )
}

export { Sidebar }
