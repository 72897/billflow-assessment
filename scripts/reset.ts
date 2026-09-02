import './load-env'
import { closeDb, getDb } from '@/lib/db'
import { runMigrations } from '@/lib/db/migrate'

/**
 *   npm run db:reset            drop, migrate, seed
 *   npm run db:reset -- --bare  drop and migrate, no demo data
 *
 * Drops only the objects this app created, by name - never `DROP SCHEMA public`,
 * which on a managed provider would take extensions and other schemas with it.
 * Refuses to run against production unless you really insist, because the whole
 * point of the command is that it destroys data.
 */
const TABLES = [
  'invoice_events',
  'payments',
  'invoice_items',
  'invoices',
  'clients',
  'business_settings',
  'sessions',
  'users',
  '_migrations',
]

const FUNCTIONS = [
  'invoice_display_status(text, date, timestamptz)',
  'peek_invoice_number(uuid)',
  'allocate_invoice_number(uuid)',
  'set_updated_at()',
]

async function main() {
  const args = process.argv.slice(2)
  const bare = args.includes('--bare')
  const force = args.includes('--force')

  if (process.env.NODE_ENV === 'production' && !force) {
    console.error('\nRefusing to reset a production database. Re-run with --force if you mean it.\n')
    process.exit(1)
  }

  const db = await getDb()
  console.log(`\nResetting the "${db.driver}" database…\n`)

  for (const table of TABLES) {
    await db.query(`DROP TABLE IF EXISTS ${table} CASCADE`)
  }
  for (const fn of FUNCTIONS) {
    await db.query(`DROP FUNCTION IF EXISTS ${fn} CASCADE`)
  }
  console.log(`  dropped ${TABLES.length} tables and ${FUNCTIONS.length} functions`)

  const report = await runMigrations(db, (msg) => console.log(msg))
  console.log(`  ${report.applied.length} migrations applied`)

  if (bare) {
    console.log('\nDone - schema only. Run `npm run db:seed` when you want demo data.\n')
    return
  }

  // Imported lazily: --bare should not pay for loading the demo dataset, and the
  // seed module must not be resolved before the schema it writes into exists.
  const { seedDemoData } = await import('@/lib/db/seed')
  const { appUrl, DEMO_EMAIL, DEMO_PASSWORD } = await import('@/lib/config')

  const seed = await db.transaction((tx) =>
    seedDemoData(tx, { email: DEMO_EMAIL, password: DEMO_PASSWORD, appUrl: appUrl() }),
  )

  console.log(`  seeded ${seed.clientCount} clients and ${seed.invoiceCount} invoices`)
  console.log(`\nDemo login: ${seed.email} / ${seed.password}`)
  console.log(`Public invoice: ${seed.payableUrl ?? '-'}\n`)
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('\nReset failed:\n', error)
    await closeDb().catch(() => {})
    process.exit(1)
  })
