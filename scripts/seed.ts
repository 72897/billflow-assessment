import './load-env'
import { appUrl, DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/config'
import { closeDb, getDb } from '@/lib/db'
import { seedDemoData } from '@/lib/db/seed'
import { formatMoney } from '@/lib/money'

/**
 *   npm run db:seed
 *
 * Loads the demo account the deployed URL is reviewed with. Prints the login and
 * the public invoice link at the end, because those are the two things the
 * assessment brief asks to be handed over.
 */
async function main() {
  const db = await getDb()
  console.log(`\nSeeding demo data via the "${db.driver}" driver…\n`)

  const report = await db.transaction((tx) =>
    seedDemoData(tx, { email: DEMO_EMAIL, password: DEMO_PASSWORD, appUrl: appUrl() }),
  )

  const byStatus = report.invoices.reduce<Record<string, number>>((counts, invoice) => {
    counts[invoice.status] = (counts[invoice.status] ?? 0) + 1
    return counts
  }, {})

  console.log(`  ${report.clientCount} clients`)
  console.log(
    `  ${report.invoiceCount} invoices (${Object.entries(byStatus)
      .map(([status, count]) => `${count} ${status}`)
      .join(', ')})`,
  )

  const paid = report.invoices.filter((invoice) => invoice.status === 'paid')
  const earned = paid.reduce((sum, invoice) => sum + invoice.total, 0)
  const outstanding = report.invoices
    .filter((invoice) => invoice.status === 'sent')
    .reduce((sum, invoice) => sum + invoice.total, 0)

  console.log(`  ${formatMoney(earned, report.currency)} earned, ${formatMoney(outstanding, report.currency)} outstanding`)

  console.log('\nDemo login')
  console.log(`  email    ${report.email}`)
  console.log(`  password ${report.password}`)

  console.log('\nPublic links (no login needed)')
  console.log(`  pay      ${report.payableUrl ?? '—'}`)
  console.log(`  receipt  ${report.receiptUrl ?? '—'}`)
  console.log('')
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('\nSeeding failed:\n', error)
    await closeDb().catch(() => {})
    process.exit(1)
  })
