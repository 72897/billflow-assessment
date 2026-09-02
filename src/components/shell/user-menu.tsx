'use client'

import { ChevronsUpDown, LogOut, Settings, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toaster'
import { api, errorMessage } from '@/lib/api/client'
import { cn, truncate } from '@/lib/utils'
import type { SessionUser } from '@/lib/auth/session'

export interface UserMenuProps {
  user: SessionUser
  businessName: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom'
  /** Collapses to just the avatar, for the mobile top bar. */
  compact?: boolean
}

/**
 * Signing out goes through the API rather than a link, because the cookie has to
 * be cleared *and* the session row deleted — a GET that mutates state would also
 * be prefetchable, which would sign people out by hovering.
 */
function UserMenu({ user, businessName, align = 'end', side = 'bottom', compact = false }: UserMenuProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await api.post('/api/auth/logout')
      // A full navigation, not router.push: it drops every cached server
      // component payload, so nothing from the signed-in session lingers.
      window.location.assign('/login')
    } catch (error) {
      setSigningOut(false)
      toast.error('Could not sign out', { description: errorMessage(error) })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md text-left transition-colors',
          compact ? 'p-0.5' : 'p-2 hover:bg-muted',
        )}
        aria-label="Account menu"
      >
        <Avatar name={user.fullName || user.email} tone="primary" size={compact ? 'sm' : 'md'} />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {user.fullName || 'Your account'}
              </span>
              <span className="block truncate text-2xs text-muted-foreground">{truncate(businessName, 26)}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} side={side} className="w-[15rem]">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <Avatar name={user.fullName || user.email} tone="primary" size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{user.fullName || 'Your account'}</p>
            <p className="truncate text-2xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <User />
            Business profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings#invoicing">
            <Settings />
            Invoice defaults
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault()
            void signOut()
          }}
        >
          <LogOut />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { UserMenu }
