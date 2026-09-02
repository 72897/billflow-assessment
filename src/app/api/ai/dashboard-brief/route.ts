import { briefContextFrom, buildDashboardBrief, type BriefContext, type DashboardBrief } from '@/lib/ai/dashboard-brief'
import { hasAiProvider } from '@/lib/ai/groq'
import { jsonOk, route } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { todayIsoDate } from '@/lib/invoice/status'
import { enforceRateLimit } from '@/lib/rate-limit'
import { getDashboardStats, getNeedsAttention } from '@/lib/repositories/dashboard'

/**
 * One brief per set of figures, remembered.
 *
 * The dashboard is the screen people return to most, and the summary of an
 * unchanged set of numbers is the same summary. Keying the cache on the figures
 * themselves - rather than on a clock - means a payment landing invalidates it
 * immediately, while ten visits in an afternoon that change nothing cost one
 * model call. In-process and per-instance, like the rate limiter above it: this
 * is an optimisation, never the source of truth.
 */
const cache = new Map<string, { fingerprint: string; brief: DashboardBrief }>()
const MAX_CACHED_USERS = 500

/** Everything the brief is allowed to mention, in one string. */
function fingerprint(context: BriefContext): string {
  const { stats, attention } = context
  return JSON.stringify([
    context.today,
    context.currency,
    stats,
    attention.map((item) => [item.invoiceNumber, item.amount, item.daysOverdue, item.reminderCount]),
  ])
}

/**
 * Explains the dashboard: what came in, what is owed, what to do next.
 *
 * Read-only in the strictest sense - two aggregate queries against the signed-in
 * user's own rows, and a paragraph back. It cannot fail into an error state: with
 * no key, a rejected key or a timeout, the deterministic brief answers instead
 * and `source` says which one you are reading.
 */
export const GET = route(async () => {
  const user = await requireUser()

  enforceRateLimit(
    { key: `ai-brief:${user.id}`, limit: 20, windowSeconds: 300 },
    'That is a lot of summaries at once. Give it a moment and try again.',
  )

  const [stats, attention] = await Promise.all([getDashboardStats(user.id), getNeedsAttention(user.id)])
  const context = briefContextFrom(stats, attention, todayIsoDate())
  const key = fingerprint(context)

  const cached = cache.get(user.id)
  if (cached?.fingerprint === key) return jsonOk({ brief: cached.brief, cached: true })

  const brief = await buildDashboardBrief(context)

  // A crude bound rather than an LRU: this map holds one small object per active
  // user, and the cost of being wrong is a recomputed paragraph.
  if (cache.size >= MAX_CACHED_USERS) cache.clear()
  cache.set(user.id, { fingerprint: key, brief })

  return jsonOk({ brief, cached: false, configured: hasAiProvider() })
})
