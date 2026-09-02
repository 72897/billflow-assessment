import './load-env'
import { closeDb, query } from '@/lib/db'

/**
 * Prints what is actually in the connected database. Useful after pointing
 * DATABASE_URL at a new host: it confirms the migrations landed and the
 * plpgsql functions the app depends on exist.
 */
async function main() {
  const tables = await query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  )
  const views = await query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name`,
  )
  const functions = await query<{ name: string }>(
    `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' ORDER BY p.proname`,
  )
  const server = await query<{ version: string }>('SELECT version() AS version')

  console.log(`\nserver:    ${server.rows[0]?.version.split(' ').slice(0, 2).join(' ')}`)
  console.log(`tables:    ${tables.rows.map((row) => row.name).join(', ') || '(none)'}`)
  console.log(`views:     ${views.rows.map((row) => row.name).join(', ') || '(none)'}`)
  console.log(`functions: ${functions.rows.map((row) => row.name).join(', ') || '(none)'}`)

  await reportContents(tables.rows.map((row) => row.name))
  await reportExposure()
}

/**
 * Row counts, plus the demo login and share link if the seed has run.
 *
 * Migrations landing and demo data landing are separate questions, and the
 * second is what a deployed URL is judged on: a login that works and an invoice
 * whose public link can be opened.
 */
async function reportContents(tables: string[]) {
  const counted = ['users', 'clients', 'invoices', 'invoice_items', 'payments', 'invoice_events'].filter((name) =>
    tables.includes(name),
  )
  if (counted.length === 0) return

  console.log('\nrows:')
  for (const table of counted) {
    const result = await query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)
    console.log(`  ${table.padEnd(20)} ${result.rows[0]?.n ?? 0}`)
  }

  const demo = await query<{ email: string; invoices: number }>(
    `SELECT u.email, count(i.id)::int AS invoices
       FROM users u LEFT JOIN invoices i ON i.user_id = u.id
      GROUP BY u.email ORDER BY invoices DESC`,
  )
  for (const row of demo.rows) console.log(`  login: ${row.email} (${row.invoices} invoices)`)

  const shared = await query<{ invoice_number: string; token: string }>(
    `SELECT invoice_number, public_token AS token FROM invoices
      WHERE public_token IS NOT NULL ORDER BY created_at LIMIT 3`,
  )
  for (const row of shared.rows) {
    console.log(`  share: ${row.invoice_number} -> ${process.env.NEXT_PUBLIC_APP_URL ?? ''}/i/${row.token}`)
  }
}

/**
 * On Supabase the same database is also published as a REST API to the public
 * `anon` key, so "is this table reachable without logging in?" is a question
 * worth being able to answer from the command line.
 */
async function reportExposure() {
  const roles = await query<{ name: string }>(
    "SELECT rolname AS name FROM pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY rolname",
  )
  if (roles.rows.length === 0) {
    console.log('\nrest api:  not a Supabase database (no anon/authenticated roles)\n')
    return
  }

  const exposure = await query<{ name: string; rls: boolean; readable: string | null }>(
    `SELECT c.relname AS name,
            c.relrowsecurity AS rls,
            (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname)
               FROM pg_roles r
              WHERE r.rolname IN ('anon', 'authenticated')
                AND has_table_privilege(r.oid, c.oid, 'SELECT')) AS readable
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND c.relname <> '_migrations'
      ORDER BY c.relname`,
  )

  const exposed = exposure.rows.filter((row) => row.readable !== null)
  console.log('\nrest api:  Supabase roles present')
  for (const row of exposure.rows) {
    const state = row.readable ? `READABLE BY ${row.readable}` : 'no grants'
    console.log(`  ${row.name.padEnd(20)} rls=${row.rls ? 'on ' : 'off'}  ${state}`)
  }
  console.log(
    exposed.length === 0
      ? '\n  Locked down: the public REST API cannot reach any table.\n'
      : `\n  ${exposed.length} table(s) are reachable with the public anon key. Run:\n` +
          '    npm run db:optional 0004_supabase_lockdown\n',
  )
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('\nInspection failed:\n', error)
    await closeDb().catch(() => {})
    process.exit(1)
  })
