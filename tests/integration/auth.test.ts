/**
 * Accounts and sessions.
 *
 * The three properties worth proving: a password is never recoverable from the
 * database, a session token is never stored in a replayable form, and signing
 * out revokes access immediately rather than waiting for a token to expire.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { makeUser, truncateAll, useTestDb } from '../helpers/db'
import { query } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  destroyAllSessionsForUser,
  issueSession,
  pruneExpiredSessions,
  resolveSession,
  revokeSession,
} from '@/lib/auth/session'
import {
  createUser,
  deleteUser,
  emailIsTaken,
  findUserByEmail,
  findUserById,
  updatePassword,
} from '@/lib/repositories/users'
import { getSettings } from '@/lib/repositories/settings'
import { createClient } from '@/lib/repositories/clients'

useTestDb()

beforeAll(async () => {
  await truncateAll()
})

describe('accounts', () => {
  it('stores a bcrypt hash, never the password', async () => {
    const user = await createUser({
      email: 'Nikhil@Studio.test',
      password: 'Password123',
      fullName: 'Nikhil Rao',
    })

    expect(user.email).toBe('nikhil@studio.test') // normalised on the way in
    const stored = await findUserByEmail('nikhil@studio.test')
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(stored?.passwordHash).not.toContain('Password123')
    expect(await verifyPassword('Password123', stored!.passwordHash)).toBe(true)
    expect(await verifyPassword('password123', stored!.passwordHash)).toBe(false)
    expect(await verifyPassword('', stored!.passwordHash)).toBe(false)
  })

  it('gives every new account its own settings row, ready to invoice', async () => {
    const user = await createUser({ email: 'meera@atelier.test', password: 'Password123', fullName: 'Meera Iyer' })
    const settings = await getSettings(user.id)

    expect(settings.businessName).toBe('Meera Iyer')
    expect(settings.businessEmail).toBe('meera@atelier.test')
    expect(settings.currency).toBe('INR')
    expect(settings.invoicePrefix).toBe('INV')
    expect(settings.nextInvoiceNumber).toBe(1)
    expect(settings.paymentTermsDays).toBe(14)
  })

  it('refuses a second account on the same email, however it is typed', async () => {
    await createUser({ email: 'dupe@studio.test', password: 'Password123', fullName: 'First' })

    await expect(
      createUser({ email: 'DUPE@studio.test', password: 'Password123', fullName: 'Second' }),
    ).rejects.toMatchObject({ fieldErrors: { email: expect.any(Array) } })

    expect(await emailIsTaken('dupe@studio.test')).toBe(true)
    expect(await emailIsTaken(' DUPE@Studio.test ')).toBe(true)
    expect(await emailIsTaken('nobody@studio.test')).toBe(false)
  })

  it('finds nothing for an unknown email instead of throwing', async () => {
    expect(await findUserByEmail('ghost@studio.test')).toBeNull()
    expect(await findUserById('7b9e6d4c-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBeNull()
  })

  it('changes a password without touching the account', async () => {
    const user = await createUser({ email: 'rotate@studio.test', password: 'Password123', fullName: 'Rotate' })
    const before = await findUserByEmail('rotate@studio.test')

    await updatePassword(user.id, 'BrandNew456')
    const after = await findUserByEmail('rotate@studio.test')

    expect(after?.id).toBe(user.id)
    expect(after?.passwordHash).not.toBe(before?.passwordHash)
    expect(await verifyPassword('BrandNew456', after!.passwordHash)).toBe(true)
    expect(await verifyPassword('Password123', after!.passwordHash)).toBe(false)
  })

  it('salts each hash, so two people with the same password look different', async () => {
    const [first, second] = await Promise.all([hashPassword('Password123'), hashPassword('Password123')])
    expect(first).not.toBe(second)
    expect(await verifyPassword('Password123', first)).toBe(true)
    expect(await verifyPassword('Password123', second)).toBe(true)
  })

  it('takes the account’s data with it when it is deleted', async () => {
    const user = await createUser({ email: 'leaving@studio.test', password: 'Password123', fullName: 'Leaving' })
    await createClient(user.id, { name: 'Client of a leaving user' })
    await issueSession(user.id)

    await deleteUser(user.id)

    expect(await findUserById(user.id)).toBeNull()
    const clients = await query('SELECT id FROM clients WHERE user_id = $1', [user.id])
    const sessions = await query('SELECT id FROM sessions WHERE user_id = $1', [user.id])
    const settings = await query('SELECT id FROM business_settings WHERE user_id = $1', [user.id])
    expect(clients.rows).toHaveLength(0)
    expect(sessions.rows).toHaveLength(0)
    expect(settings.rows).toHaveLength(0)
  })
})
describe('sessions', () => {
  it('stores only a digest of the token', async () => {
    const user = await makeUser('session')
    const { token } = await issueSession(user.id, 'Vitest/1.0')

    const { rows } = await query<{ token_hash: string; user_agent: string }>(
      'SELECT token_hash, user_agent FROM sessions WHERE user_id = $1',
      [user.id],
    )
    expect(rows).toHaveLength(1)
    // A database dump cannot be replayed as a login.
    expect(rows[0]!.token_hash).not.toBe(token)
    expect(rows[0]!.token_hash).toHaveLength(64)
    expect(rows[0]!.user_agent).toBe('Vitest/1.0')

    expect(await resolveSession(token)).toMatchObject({ id: user.id, email: user.email })
  })

  it('refuses an unknown, empty or tampered token', async () => {
    const user = await makeUser('session')
    const { token } = await issueSession(user.id)

    expect(await resolveSession('')).toBeNull()
    expect(await resolveSession('not-a-real-token')).toBeNull()
    expect(await resolveSession(`${token}x`)).toBeNull()
    expect(await resolveSession(token.slice(0, -1))).toBeNull()
  })

  it('signs out immediately, without waiting for the token to expire', async () => {
    const user = await makeUser('session')
    const first = await issueSession(user.id)
    const second = await issueSession(user.id)

    await revokeSession(first.token)
    expect(await resolveSession(first.token)).toBeNull()
    // The other device stays signed in.
    expect(await resolveSession(second.token)).not.toBeNull()

    await destroyAllSessionsForUser(user.id)
    expect(await resolveSession(second.token)).toBeNull()
  })

  it('treats an expired session as signed out and tidies the row away', async () => {
    const user = await makeUser('session')
    const { token } = await issueSession(user.id)
    await query("UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE user_id = $1", [user.id])

    expect(await resolveSession(token)).toBeNull()
    const { rows } = await query('SELECT id FROM sessions WHERE user_id = $1', [user.id])
    expect(rows).toHaveLength(0)
  })

  it('prunes expired sessions in bulk and leaves live ones alone', async () => {
    await query('DELETE FROM sessions')
    const user = await makeUser('session')
    await issueSession(user.id)
    await issueSession(user.id)
    await query("UPDATE sessions SET expires_at = now() - interval '1 day'", [])
    const live = await issueSession(user.id)

    expect(await pruneExpiredSessions()).toBe(2)
    expect(await resolveSession(live.token)).not.toBeNull()
  })

  it('issues a session that lasts 30 days', async () => {
    const user = await makeUser('session')
    const { expiresAt } = await issueSession(user.id)
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})
