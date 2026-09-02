import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, SESSION_TTL_DAYS, SESSION_TTL_SECONDS } from '@/lib/auth/cookie'
import { query, queryOne } from '@/lib/db'

/**
 * Session handling.
 *
 * A session is a random 32-byte token held in an httpOnly cookie. Only its
 * SHA-256 digest is stored, so a database dump cannot be replayed as a login.
 * Sessions live in Postgres rather than in a self-contained JWT, which means
 * signing out (or deleting an account) revokes access immediately (AUTH-07).
 *
 * The cookie name lives in `./cookie` because the middleware needs it and cannot
 * load this file; re-exported here so callers have one obvious import.
 */

export { SESSION_COOKIE, SESSION_TTL_DAYS }

export interface SessionUser {
  id: string
  email: string
  fullName: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Random, URL-safe, unguessable share token for a public invoice link. */
export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url')
}

export function generateReference(prefix = 'PAY'): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

// ---------------------------------------------------------------------------
// Lifecycle
//
// The database half of a session (issue / resolve / revoke) is kept separate
// from the cookie half, so the rules that matter — only the digest is stored, an
// expired row is refused and cleaned up — can be exercised without a request.
// ---------------------------------------------------------------------------

export interface IssuedSession {
  token: string
  expiresAt: Date
}

export async function issueSession(userId: string, userAgent?: string | null): Promise<IssuedSession> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashToken(token), (userAgent ?? '').slice(0, 300), expiresAt.toISOString()],
  )

  return { token, expiresAt }
}

/** Looks a token up. Returns null for unknown or expired tokens. */
export async function resolveSession(token: string): Promise<SessionUser | null> {
  if (!token) return null

  const row = await queryOne<{ id: string; email: string; full_name: string; expires_at: Date | string }>(
    `SELECT u.id, u.email, u.full_name, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
      LIMIT 1`,
    [hashToken(token)],
  ).catch(() => null)

  if (!row) return null

  const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at)
  if (expiresAt.getTime() <= Date.now()) {
    await revokeSession(token)
    return null
  }

  return { id: row.id, email: row.email, fullName: row.full_name }
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]).catch(() => undefined)
}

export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const { token } = await issueSession(userId, userAgent)

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })

  return token
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await revokeSession(token)
  store.delete(SESSION_COOKIE)
}

export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

/** Resolves the signed-in user, or null. Expired sessions are cleaned up. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? resolveSession(token) : null
}

/** Housekeeping: drop sessions that have already expired. */
export async function pruneExpiredSessions(): Promise<number> {
  const { rowCount } = await query('DELETE FROM sessions WHERE expires_at <= now()')
  return rowCount
}
