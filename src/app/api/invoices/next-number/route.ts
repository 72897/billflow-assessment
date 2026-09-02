import { jsonOk, route } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { peekInvoiceNumber } from '@/lib/repositories/settings'

/**
 * The number the next invoice would get.
 *
 * A peek, not an allocation: opening the new-invoice form twice must not burn two
 * numbers and leave a gap. The counter only advances when an invoice is actually
 * saved with the suggested number (INV-02).
 */
export const GET = route(async () => {
  const user = await requireUser()
  return jsonOk({ invoiceNumber: await peekInvoiceNumber(user.id) })
})
