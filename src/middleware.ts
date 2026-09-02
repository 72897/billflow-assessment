import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/cookie'

/**
 * A cheap first gate, not the authority.
 *
 * Middleware runs before the page and has no database, so all it can see is
 * whether a session cookie exists. That is enough to bounce an anonymous
 * visitor straight to /login instead of rendering a shell and redirecting a
 * moment later — but a forged or expired cookie gets past it, which is fine:
 * every protected page still calls `requireUserPage()`, and that hits the
 * sessions table. Treating this as security rather than as a shortcut is the
 * mistake to avoid.
 */
const PROTECTED = ['/dashboard', '/clients', '/invoices', '/settings']
const AUTH_PAGES = ['/login', '/signup']

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)

  if (!hasSession && PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?redirectTo=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  // Someone already signed in has no use for the sign-in form.
  if (hasSession && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  /**
   * Everything except API routes, static assets and the public invoice pages —
   * `/i/<token>` is deliberately reachable with no cookie at all.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|i/).*)'],
}
