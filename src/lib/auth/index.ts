import { redirect } from 'next/navigation'
import { UnauthorizedError } from '@/lib/errors'
import { getSessionUser, type SessionUser } from './session'

export * from './session'
export * from './password'

/**
 * For server components and pages: resolves the signed-in user or sends the
 * visitor to /login carrying a return path, so they land where they intended
 * after signing in (AUTH-06).
 */
export async function requireUserPage(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    const target = returnTo && returnTo.startsWith('/') ? `?redirectTo=${encodeURIComponent(returnTo)}` : ''
    redirect(`/login${target}`)
  }
  return user
}

/**
 * For route handlers and server actions: throws instead of redirecting, so the
 * caller gets a 401 it can handle in the UI without losing form state (AUTH-08).
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new UnauthorizedError()
  return user
}

export type { SessionUser }
