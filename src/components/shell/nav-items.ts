import { FileText, LayoutDashboard, Settings, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Shown in the phone tab bar; the sidebar uses the full label. */
  shortLabel?: string
}

/**
 * One list, three navigations: the desktop sidebar, the phone tab bar and the
 * mobile drawer all read it, so a new screen cannot appear in two of them and be
 * forgotten in the third.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Home' },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/**
 * Whether a nav item owns the current path.
 *
 * `/invoices/new` has to light up "Invoices", so this matches the prefix — but
 * only at a segment boundary, or `/invoices` would also claim a future
 * `/invoices-archive`.
 */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
