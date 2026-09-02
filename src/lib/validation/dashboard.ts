import { z } from 'zod'

/**
 * The dashboard takes no input beyond the chart window, and an unknown value
 * should show the default chart rather than an error page — so this one
 * `.catch()`es instead of rejecting.
 */
export const INCOME_RANGES = ['this_month', 'last_30_days', 'this_year', 'last_12_months'] as const

export const dashboardQuerySchema = z.object({
  range: z.enum(INCOME_RANGES).catch('this_month').default('this_month'),
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>
