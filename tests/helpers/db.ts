/**
 * Test database harness.
 *
 * Every test file runs against its own in-memory PostgreSQL (PGlite with
 * `memory://`), created fresh by the `forks` pool. That means the integration
 * tests exercise the real schema - constraints, triggers, plpgsql functions and
 * transactions included - with no external service and no cleanup to forget.
 *
 * DATABASE_URL is deleted deliberately: a test run must never be able to reach
 * a real database.
 */

process.env.PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR || 'memory://'
process.env.BILLFLOW_QUIET_DB = '1'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-value'
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
delete process.env.DATABASE_URL

import { afterAll, beforeAll } from 'vitest'
import { closeDb, getDb, query } from '@/lib/db'
import { runMigrations } from '@/lib/db/migrate'
import { createUser } from '@/lib/repositories/users'

let migrated: Promise<void> | null = null

export function migrateOnce(): Promise<void> {
  if (!migrated) {
    migrated = (async () => {
      const db = await getDb()
      await runMigrations(db, () => undefined)
    })()
  }
  return migrated
}

/** Registers the migrate/teardown hooks. Call once at the top of a test file. */
export function useTestDb(): void {
  beforeAll(async () => {
    await migrateOnce()
  })
  afterAll(async () => {
    await closeDb()
  })
}

/** Wipes every tenant table, leaving the schema in place. */
export async function truncateAll(): Promise<void> {
  await query(
    `TRUNCATE invoice_events, payments, invoice_items, invoices, clients,
              business_settings, sessions, users RESTART IDENTITY CASCADE`,
  )
}

let sequence = 0

/** Creates an isolated account. Each call gets a unique email. */
export async function makeUser(label = 'user'): Promise<{ id: string; email: string }> {
  sequence += 1
  const email = `${label}.${sequence}.${Date.now()}@example.test`
  const user = await createUser({ email, password: 'Password123', fullName: `Test ${label}` })
  return { id: user.id, email: user.email }
}
