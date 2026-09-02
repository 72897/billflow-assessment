import { jsonOk, parseOrThrow, route, searchParamsToObject } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { getDashboardData } from '@/lib/repositories/dashboard'
import { dashboardQuerySchema } from '@/lib/validation/dashboard'

/**
 * The dashboard in one round trip.
 *
 * The page itself renders on the server, so this endpoint exists for the chart's
 * range switcher - changing "This month" to "Last 12 months" refetches only the
 * data, without a navigation.
 */
export const GET = route(async (request) => {
  const user = await requireUser()
  const { range } = parseOrThrow(dashboardQuerySchema, searchParamsToObject(request.url))

  return jsonOk(await getDashboardData(user.id, range))
})
