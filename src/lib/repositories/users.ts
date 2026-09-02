import { isUniqueViolation, query, queryOne, transaction } from '@/lib/db'
import { ConflictError } from '@/lib/errors'
import { hashPassword } from '@/lib/auth/password'
import { text, tsRequired } from './mappers'
import { createDefaultSettings } from './settings'

export interface UserRecord {
  id: string
  email: string
  fullName: string
  createdAt: string
}

export interface UserWithSecret extends UserRecord {
  passwordHash: string
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: text(row.id),
    email: text(row.email),
    fullName: text(row.full_name),
    createdAt: tsRequired(row.created_at),
  }
}

/**
 * Looked up on `lower(email)` to match `users_email_lower_key`, so
 * `Demo@BillFlow.app` and `demo@billflow.app` are the same account. The address
 * is trimmed as well as lowered: a pasted address often carries a trailing
 * space, and the Zod schemas normalise the same way, so a hand-built call and a
 * form submission agree on which account they mean.
 */
export async function findUserByEmail(email: string): Promise<UserWithSecret | null> {
  const row = await queryOne(
    `SELECT id, email, full_name, password_hash, created_at
       FROM users
      WHERE lower(email) = lower(btrim($1))
      LIMIT 1`,
    [email],
  )
  return row ? { ...mapUser(row), passwordHash: text(row.password_hash) } : null
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const row = await queryOne('SELECT id, email, full_name, created_at FROM users WHERE id = $1 LIMIT 1', [userId])
  return row ? mapUser(row) : null
}

export interface CreateUserInput {
  email: string
  password: string
  fullName: string
}

/**
 * The account and its settings row are created together: every later read can
 * then assume settings exist, and a half-created account can never be logged
 * into. The unique index on `lower(email)` is the real guard against two
 * simultaneous signups — the pre-check below only exists to produce a friendly
 * message in the common case.
 */
export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const passwordHash = await hashPassword(input.password)

  try {
    return await transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES (lower(btrim($1)), $2, $3)
         RETURNING id, email, full_name, created_at`,
        [input.email, passwordHash, input.fullName],
      )
      const user = mapUser(rows[0]!)
      await createDefaultSettings(tx, user.id, {
        businessName: input.fullName,
        businessEmail: user.email,
      })
      return user
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An account with that email already exists.', {
        email: ['An account with that email already exists.'],
      })
    }
    throw error
  }
}

/** Used by signup to say "that email is taken" before attempting the insert. */
export async function emailIsTaken(email: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(btrim($1))) AS exists',
    [email],
  )
  return row?.exists === true
}

export async function updatePassword(userId: string, password: string): Promise<void> {
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, await hashPassword(password)])
}

export async function deleteUser(userId: string): Promise<void> {
  // Every tenant table cascades from `users`, so one statement removes the
  // account and all of its data.
  await query('DELETE FROM users WHERE id = $1', [userId])
}
