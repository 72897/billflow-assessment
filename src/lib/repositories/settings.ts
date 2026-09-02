import { query, queryOne, type Queryable } from '@/lib/db'
import { toDecimal } from '@/lib/money'
import type { SettingsInput } from '@/lib/validation/settings'
import type { BusinessSettings, BusinessSnapshot } from '@/types'
import { mapSettings, snapshotFromSettings } from './mappers'

const SETTINGS_COLUMNS = `
  id, user_id, business_name, business_email, phone, address, tax_id, logo_url,
  currency, invoice_prefix, next_invoice_number,
  default_tax_rate::text AS default_tax_rate,
  default_notes, payment_terms_days, created_at, updated_at
`

/** Creates the settings row for a brand-new account. Idempotent. */
export async function createDefaultSettings(
  db: Queryable,
  userId: string,
  overrides: Partial<{ businessName: string; businessEmail: string }> = {},
): Promise<BusinessSettings> {
  const { rows } = await db.query(
    `INSERT INTO business_settings (user_id, business_name, business_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING ${SETTINGS_COLUMNS}`,
    [userId, overrides.businessName ?? '', overrides.businessEmail ?? ''],
  )
  return mapSettings(rows[0]!)
}

/** Returns the user's settings, creating defaults if the row is missing. */
export async function getSettings(userId: string): Promise<BusinessSettings> {
  const row = await queryOne(`SELECT ${SETTINGS_COLUMNS} FROM business_settings WHERE user_id = $1`, [userId])
  if (row) return mapSettings(row)

  const { rows } = await query(
    `INSERT INTO business_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING ${SETTINGS_COLUMNS}`,
    [userId],
  )
  return mapSettings(rows[0]!)
}

export async function getBusinessSnapshot(userId: string): Promise<BusinessSnapshot> {
  return snapshotFromSettings(await getSettings(userId))
}

export async function updateSettings(userId: string, input: SettingsInput): Promise<BusinessSettings> {
  const { rows } = await query(
    `UPDATE business_settings
        SET business_name       = $2,
            business_email      = $3,
            phone               = $4,
            address             = $5,
            tax_id              = $6,
            currency            = $7,
            invoice_prefix      = $8,
            next_invoice_number = $9,
            default_tax_rate    = $10,
            default_notes       = $11,
            payment_terms_days  = $12
      WHERE user_id = $1
      RETURNING ${SETTINGS_COLUMNS}`,
    [
      userId,
      input.businessName,
      input.businessEmail,
      input.phone,
      input.address,
      input.taxId,
      input.currency,
      input.invoicePrefix,
      input.nextInvoiceNumber,
      toDecimal(input.defaultTaxRate),
      input.defaultNotes,
      input.paymentTermsDays,
    ],
  )
  if (!rows[0]) {
    // No row yet (an account created before this table existed): create then retry.
    await getSettings(userId)
    return updateSettings(userId, input)
  }
  return mapSettings(rows[0])
}

export async function updateLogoUrl(userId: string, logoUrl: string | null): Promise<BusinessSettings> {
  const { rows } = await query(
    `UPDATE business_settings SET logo_url = $2 WHERE user_id = $1 RETURNING ${SETTINGS_COLUMNS}`,
    [userId, logoUrl],
  )
  if (!rows[0]) {
    await getSettings(userId)
    const retry = await query(
      `UPDATE business_settings SET logo_url = $2 WHERE user_id = $1 RETURNING ${SETTINGS_COLUMNS}`,
      [userId, logoUrl],
    )
    return mapSettings(retry.rows[0]!)
  }
  return mapSettings(rows[0])
}

/** Read-only preview of the next invoice number, e.g. `INV-0043`. */
export async function peekInvoiceNumber(userId: string): Promise<string> {
  const row = await queryOne<{ number: string }>('SELECT peek_invoice_number($1) AS number', [userId])
  return row?.number ?? 'INV-0001'
}
