import { aiAppError } from '@/lib/ai/errors'
import { hasAiProvider } from '@/lib/ai/groq'
import { buildInvoiceDraft } from '@/lib/ai/invoice-draft'
import { jsonOk, parseJson, route } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { todayIsoDate } from '@/lib/invoice/status'
import { enforceRateLimit } from '@/lib/rate-limit'
import { listClientOptions } from '@/lib/repositories/clients'
import { getSettings } from '@/lib/repositories/settings'
import { invoiceDraftSchema } from '@/lib/validation/ai'

/**
 * Plain language in, invoice draft out.
 *
 * The handler owns three things the parser must not: the session, the rate limit,
 * and the context. Client names and the account's currency and tax defaults are
 * read here from the signed-in user's own rows, so the model is never told about
 * anybody else's data and the id it comes back with was in the list all along.
 *
 * Nothing is written. This endpoint fills a form; the user still reads it and
 * presses Save, and the invoice goes through the same validation and the same
 * server-side totals as one typed by hand.
 */
export const POST = route(async (request) => {
  const user = await requireUser()

  // A model call costs money and time, so the ceiling is lower than a normal
  // mutation's - generous for someone drafting invoices, useless for a script.
  enforceRateLimit(
    { key: `ai-draft:${user.id}`, limit: 30, windowSeconds: 300 },
    'That is a lot of drafts at once. Give it a moment and try again.',
  )

  const { text } = await parseJson(request, invoiceDraftSchema)
  const [clients, settings] = await Promise.all([listClientOptions(user.id), getSettings(user.id)])

  try {
    const draft = await buildInvoiceDraft(text, {
      clients,
      currency: settings.currency,
      defaultTaxRate: settings.defaultTaxRate,
      paymentTermsDays: settings.paymentTermsDays,
      today: todayIsoDate(),
    })
    return jsonOk({ draft, configured: hasAiProvider() })
  } catch (error) {
    throw aiAppError(error)
  }
})
