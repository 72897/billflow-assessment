import { jsonOk, parseJson, route } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { getSettings, peekInvoiceNumber, updateSettings } from '@/lib/repositories/settings'
import { settingsSchema } from '@/lib/validation/settings'

export const GET = route(async () => {
  const user = await requireUser()
  const [settings, nextNumber] = await Promise.all([getSettings(user.id), peekInvoiceNumber(user.id)])

  return jsonOk({ settings, nextInvoiceNumber: nextNumber })
})

/**
 * Saves the business profile.
 *
 * Everything here is letterhead: name, address, currency, prefix, default tax and
 * terms. Changing it affects invoices created *from now on* — existing rows keep
 * the snapshot frozen at creation, so a client's copy never silently changes
 * after they have been sent it (SET-05).
 */
export const PUT = route(async (request) => {
  const user = await requireUser()
  const input = await parseJson(request, settingsSchema)
  const settings = await updateSettings(user.id, input)

  return jsonOk({ settings, nextInvoiceNumber: await peekInvoiceNumber(user.id) })
})
