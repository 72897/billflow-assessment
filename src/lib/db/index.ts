/**
 * Database access layer.
 *
 * BillFlow talks to PostgreSQL through two interchangeable drivers:
 *
 *   - `pg`     — used whenever DATABASE_URL is set (production, and any local
 *                Postgres/Supabase/Neon instance).
 *   - `pglite` — PostgreSQL 16 compiled to WebAssembly, storing its data in
 *                ./.pgdata. Used when DATABASE_URL is empty so the project runs
 *                with zero setup. It is real Postgres, so the same migrations,
 *                constraints, plpgsql functions and transactions apply.
 *
 * Production refuses to start without DATABASE_URL: PGlite needs a writable
 * filesystem, which serverless hosts do not provide.
 */

export interface QueryResult<T> {
  rows: T[]
  rowCount: number
}

/** Anything that can run a parameterised statement — pool, client or tx. */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>
}

export interface Database extends Queryable {
  /** Runs a multi-statement script (migrations, seeds). No parameters. */
  exec(sql: string): Promise<void>
  /** Runs `fn` inside BEGIN/COMMIT, rolling back on any thrown error. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
  readonly driver: 'pg' | 'pglite'
}

/** Serialises transactions for the single-connection PGlite driver. */
class Mutex {
  private tail: Promise<void> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn)
    // Keep the chain alive even when a caller rejects.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

function normaliseRows<T>(raw: { rows?: unknown[]; rowCount?: number | null; affectedRows?: number }): QueryResult<T> {
  const rows = (raw.rows ?? []) as T[]
  const rowCount = raw.rowCount ?? raw.affectedRows ?? rows.length
  return { rows, rowCount: rowCount ?? 0 }
}

// ---------------------------------------------------------------------------
// pg driver
// ---------------------------------------------------------------------------

/**
 * Decides the TLS settings for a hosted Postgres and hands back a connection
 * string with `sslmode` removed.
 *
 * `pg` lets a connection string override the explicit `ssl` option, and its
 * `sslmode=require` handling verifies the certificate chain — which fails
 * against Supabase, Neon and RDS, whose intermediate CAs are not in Node's
 * trust store. Managed providers hand out URLs with `sslmode=require` already
 * in them, so the flag is read here and taken out of the string rather than
 * left to break a deployment.
 */
export function resolveSsl(connectionString: string): {
  connectionString: string
  ssl: { rejectUnauthorized: boolean } | undefined
} {
  const mode = /[?&]sslmode=([a-z-]+)/i.exec(connectionString)?.[1]?.toLowerCase()
  const stripped = connectionString.replace(/([?&])sslmode=[a-z-]+&?/gi, '$1').replace(/[?&]$/, '')

  const hostedProvider = /supabase\.|neon\.tech|render\.com|railway\.app|amazonaws\.com|azure\.com/.test(
    connectionString,
  )
  const wantsSsl = mode ? mode !== 'disable' : hostedProvider

  return { connectionString: stripped, ssl: wantsSsl ? { rejectUnauthorized: false } : undefined }
}

async function createPgDatabase(rawConnectionString: string): Promise<Database> {
  const pgModule = await import('pg')
  const pg = (pgModule as unknown as { default?: typeof pgModule }).default ?? pgModule
  const { Pool, types } = pg as typeof import('pg')

  // Return DATE as the plain 'YYYY-MM-DD' string Postgres sent, instead of a
  // JS Date that would be shifted by the server's timezone.
  types.setTypeParser(1082, (value: string) => value)

  const { connectionString, ssl } = resolveSsl(rawConnectionString)

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl,
  })

  pool.on('error', (err) => {
    console.error('[db] idle pool client error:', err.message)
  })

  return {
    driver: 'pg',
    async query<T>(text: string, params?: readonly unknown[]) {
      const res = await pool.query(text, params ? [...params] : undefined)
      return normaliseRows<T>(res as never)
    },
    async exec(sql: string) {
      const client = await pool.connect()
      try {
        await client.query(sql)
      } finally {
        client.release()
      }
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const tx: Queryable = {
          async query<R>(text: string, params?: readonly unknown[]) {
            const res = await client.query(text, params ? [...params] : undefined)
            return normaliseRows<R>(res as never)
          },
        }
        const result = await fn(tx)
        await client.query('COMMIT')
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* the connection is already broken; nothing useful to do */
        }
        throw error
      } finally {
        client.release()
      }
    },
    async close() {
      await pool.end()
    },
  }
}

// ---------------------------------------------------------------------------
// PGlite driver (embedded Postgres, no install required)
// ---------------------------------------------------------------------------

async function createPgliteDatabase(dataDir: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  const client = await PGlite.create({ dataDir })
  const mutex = new Mutex()

  return {
    driver: 'pglite',
    async query<T>(text: string, params?: readonly unknown[]) {
      const res = await mutex.run(() => client.query(text, params ? [...params] : undefined))
      return normaliseRows<T>(res as never)
    },
    async exec(sql: string) {
      await mutex.run(() => client.exec(sql))
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return mutex.run(async () => {
        await client.exec('BEGIN')
        try {
          const tx: Queryable = {
            async query<R>(text: string, params?: readonly unknown[]) {
              const res = await client.query(text, params ? [...params] : undefined)
              return normaliseRows<R>(res as never)
            },
          }
          const result = await fn(tx)
          await client.exec('COMMIT')
          return result
        } catch (error) {
          try {
            await client.exec('ROLLBACK')
          } catch {
            /* ignore */
          }
          throw error
        }
      })
    },
    async close() {
      await client.close()
    },
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __billflowDb: Promise<Database> | undefined
}

function resolveDataDir(): string {
  return process.env.PGLITE_DATA_DIR?.trim() || './.pgdata'
}

async function build(): Promise<Database> {
  const url = process.env.DATABASE_URL?.trim()

  if (url) {
    return createPgDatabase(url)
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is required in production. BillFlow falls back to the embedded ' +
        'PGlite engine only in development, because it needs a writable data directory.',
    )
  }

  const dataDir = resolveDataDir()
  if (!process.env.BILLFLOW_QUIET_DB) {
    console.log(`[db] DATABASE_URL not set — using embedded PGlite at ${dataDir}`)
  }
  return createPgliteDatabase(dataDir)
}

/** Returns the process-wide database handle, creating it on first use. */
export function getDb(): Promise<Database> {
  if (!globalThis.__billflowDb) {
    globalThis.__billflowDb = build().catch((error) => {
      // Do not cache a failed connection — the next request should retry.
      globalThis.__billflowDb = undefined
      throw error
    })
  }
  return globalThis.__billflowDb
}

/** Convenience wrapper: `const { rows } = await query<Row>(sql, params)`. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> {
  const db = await getDb()
  return db.query<T>(text, params)
}

/** Returns the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
): Promise<T | null> {
  const { rows } = await query<T>(text, params)
  return rows[0] ?? null
}

/** Runs `fn` inside a transaction. */
export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb()
  return db.transaction(fn)
}

export async function closeDb(): Promise<void> {
  const existing = globalThis.__billflowDb
  globalThis.__billflowDb = undefined
  if (existing) {
    const db = await existing.catch(() => null)
    await db?.close()
  }
}

/** True when a unique constraint with the given name was violated. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const err = error as { code?: string; constraint?: string; message?: string } | null
  if (!err) return false
  const isUnique = err.code === '23505' || /duplicate key value/i.test(err.message ?? '')
  if (!isUnique) return false
  if (!constraint) return true
  return err.constraint === constraint || (err.message ?? '').includes(constraint)
}
