import './load-env'
import { closeDb, getDb } from '@/lib/db'
import { runMigrations } from '@/lib/db/migrate'

async function main() {
  const db = await getDb()
  console.log(`\nRunning migrations against the "${db.driver}" driver…\n`)

  const report = await runMigrations(db, (msg) => console.log(msg))

  if (report.applied.length === 0) {
    console.log('  Nothing to do — database is already up to date.')
  }
  console.log(
    `\nDone. ${report.applied.length} applied, ${report.skipped.length} already present.\n`,
  )
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('\nMigration failed:\n', error)
    await closeDb().catch(() => {})
    process.exit(1)
  })
