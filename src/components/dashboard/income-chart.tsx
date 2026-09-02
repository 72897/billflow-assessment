'use client'

import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeaderRow, CardTitle } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api/client'
import { formatCompactAmount, formatMoney } from '@/lib/money'
import type { DashboardData, IncomeRange } from '@/types'

const RANGE_LABELS: Record<IncomeRange, string> = {
  this_month: 'This month',
  last_30_days: 'Last 30 days',
  this_year: 'This year',
  last_12_months: 'Last 12 months',
}

const RANGES = Object.keys(RANGE_LABELS) as IncomeRange[]

interface TooltipPayload {
  active?: boolean
  payload?: Array<{ payload: { label: string; amount: number } }>
}

function ChartTooltip({ active, payload, currency }: TooltipPayload & { currency: string }) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-pop">
      <p className="text-2xs text-muted-foreground">{point.label}</p>
      <p className="tabular text-[13px] font-semibold">{formatMoney(point.amount, currency)}</p>
    </div>
  )
}

export interface IncomeChartProps {
  income: DashboardData['income']
  currency: string
}

/**
 * Income over time, with the range switcher refetching from `/api/dashboard`
 * rather than navigating — the rest of the page has not changed, so there is no
 * reason to re-render it.
 *
 * A failed refetch keeps the previous series on screen and puts the error inside
 * this card. The stat cards above were rendered on the server and are still
 * correct; blanking the whole dashboard because one chart request failed would
 * throw away good information.
 */
function IncomeChart({ income: initial, currency }: IncomeChartProps) {
  const [income, setIncome] = useState(initial)
  const [range, setRange] = useState<IncomeRange>(initial.range)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function changeRange(next: string) {
    const nextRange = next as IncomeRange
    setRange(nextRange)
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<DashboardData>(`/api/dashboard?range=${nextRange}`)
      setIncome(data.income)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }

  const hasIncome = income.points.some((point) => point.amount > 0)

  return (
    <Card>
      <CardHeaderRow>
        <div>
          <CardTitle>Income</CardTitle>
          <p className="tabular mt-0.5 text-[13px] text-muted-foreground">
            {formatMoney(income.total, currency)} received · {RANGE_LABELS[income.range].toLowerCase()}
          </p>
        </div>
        <Select value={range} onValueChange={changeRange} disabled={loading}>
          <SelectTrigger className="h-8 w-[9.5rem] text-[13px]" aria-label="Income date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((option) => (
              <SelectItem key={option} value={option}>
                {RANGE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeaderRow>

      {error ? (
        <ErrorState
          size="sm"
          error={error}
          title="The chart did not load"
          onRetry={() => void changeRange(range)}
        />
      ) : (
        <div className="relative px-1 pb-4 pr-4 sm:pb-5">
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60">
              <span className="text-2xs font-medium text-muted-foreground">Updating…</span>
            </div>
          ) : null}

          <div className="h-[220px] w-full sm:h-[248px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={income.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(243 75% 59%)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="hsl(243 75% 59%)" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(214 32% 91%)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={18}
                  tick={{ fontSize: 11, fill: 'hsl(215 16% 47%)' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(value: number) => formatCompactAmount(value)}
                  tick={{ fontSize: 11, fill: 'hsl(215 16% 47%)' }}
                />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: 'hsl(214 32% 91%)' }} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(243 75% 59%)"
                  strokeWidth={2}
                  fill="url(#incomeFill)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/*
            The chart itself is aria-hidden: a screen reader gets nothing useful
            from an SVG path. This sentence carries the same information.
          */}
          <p className="sr-only">
            {hasIncome
              ? `Income for ${RANGE_LABELS[income.range].toLowerCase()} totals ${formatMoney(income.total, currency)}.`
              : `No payments were received in ${RANGE_LABELS[income.range].toLowerCase()}.`}
          </p>

          {hasIncome ? null : (
            <p className="px-4 pb-1 text-center text-2xs text-muted-foreground sm:-mt-2">
              No payments landed in this period yet — the line fills in as invoices are paid.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

export { IncomeChart }
