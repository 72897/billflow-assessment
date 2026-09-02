import './load-env'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { closeDb, getDb } from '@/lib/db'

/**
 * Runs one of the host-specific files in db/migrations/optional. These are kept
 * out of `db:migrate` because they only make sense on particular hosts:
 *
 *   npm run db:optional 0004_supabase_lockdown
 */
async function main() {
  const name = process.argv[2]
  if (!name) {
    console.error('\nUsage: npm run db:optional <file-name-without-.sql>\n')
    process.exit(1)
  }

  const file = path.join(process.cwd(), 'db', 'migrations', 'optional', `${name.replace(/\.sql$/, '')}.sql`)
  const sql = await readFile(file, 'utf8')

  const db = await getDb()
  console.log(`\nApplying ${path.basename(file)} to the "${db.driver}" driver…`)
  await db.exec(sql)
  console.log('Done.\n')
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('\nFailed:\n', error)
    await closeDb().catch(() => {})
    process.exit(1)
  })
