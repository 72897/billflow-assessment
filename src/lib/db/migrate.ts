/**
 * Migration runner.
 *
 * Applies every `db/migrations/*.sql` file that has not been applied yet, in
 * filename order, each inside its own transaction, and records it in the
 * `_migrations` table. Safe to run repeatedly.
 *
 *   npm run db:migrate
 */
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { Database } from '@/lib/db'

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations')

const CREATE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id         serial PRIMARY KEY,
    name       text        NOT NULL UNIQUE,
    checksum   text        NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`

export interface MigrationReport {
  applied: string[]
  skipped: string[]
  driver: string
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
}

export async function runMigrations(db: Database, log: (msg: string) => void = () => {}): Promise<MigrationReport> {
  await db.exec(CREATE_TRACKING_TABLE)

  const { rows } = await db.query<{ name: string; checksum: string }>('SELECT name, checksum FROM _migrations')
  const alreadyApplied = new Map(rows.map((row) => [row.name, row.checksum]))

  const files = await listMigrationFiles()
  const report: MigrationReport = { applied: [], skipped: [], driver: db.driver }

  for (const name of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16)
    const previous = alreadyApplied.get(name)

    if (previous) {
      if (previous !== checksum) {
        log(
          `  ! ${name} was modified after it was applied (checksum ${previous} -> ${checksum}). ` +
            `Add a new migration instead of editing an applied one.`,
        )
      }
      report.skipped.push(name)
      continue
    }

    // exec() and the INSERT must land together, so wrap them in one explicit
    // transaction. DDL is transactional in Postgres, so a failure leaves no
    // half-applied migration behind.
    try {
      await db.exec(`BEGIN;\n${sql}\nCOMMIT;`)
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => {})
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error })
    }
    await db.query('INSERT INTO _migrations (name, checksum) VALUES ($1, $2)', [name, checksum])

    report.applied.push(name)
    log(`  + ${name}`)
  }

  return report
}
