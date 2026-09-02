/**
 * Loads .env.local / .env into process.env for the standalone CLI scripts.
 * Next.js does this automatically for the app; the scripts run outside it.
 */
import { config } from 'dotenv'
import path from 'node:path'
import { existsSync } from 'node:fs'

const candidates = ['.env.local', '.env']

for (const file of candidates) {
  const full = path.join(process.cwd(), file)
  if (existsSync(full)) {
    config({ path: full, override: false, quiet: true })
  }
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'script-only-secret-not-used-for-cookie-signing'
}
