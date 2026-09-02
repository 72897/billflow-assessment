import { z } from 'zod'

/**
 * The dashboard takes no input beyond the chart window, and an unknown value
 * should show the default chart rather than an error page — so this one
 * `.catch()`es instead of rejecting.
 *
 * The default is a rolling 30 days rather than the calendar month: on the 2nd of
 * any month "this month" is a two-point line, and the headline chart on the
 * first screen of the app should not be empty for the first week of every month.
 */
export const INCOME_RANGES = ['this_month', 'last_30_days', 'this_year', 'last_12_months'] as const

export const dashboardQuerySchema = z.object({
  range: z.enum(INCOME_RANGES).catch('last_30_days').default('last_30_days'),
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>
