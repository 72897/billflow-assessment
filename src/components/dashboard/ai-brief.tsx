'use client'

import { ArrowRight, Loader2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import type { DashboardBrief } from '@/lib/ai/dashboard-brief'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export interface AiBriefProps {
  /**
   * The deterministic brief, rendered on the server. It is on screen before the
   * first paint, so this card never shows a skeleton and never shows nothing —
   * the model's version replaces it if and when it arrives.
   */
  initial: DashboardBrief
  /** False with no GROQ_API_KEY, which skips the round trip entirely. */
  upgradable: boolean
}

/**
 * The dashboard in a paragraph, with the next three things to do.
 *
 * The upgrade-in-place pattern is the point: the numbers are explained the
 * instant the page renders, and the model improves the wording afterwards
 * rather than being a gate in front of it. A failed call is invisible, because
 * what it would have replaced is still correct.
 */
function AiBrief({ initial, upgradable }: AiBriefProps) {
  const [brief, setBrief] = useState(initial)
  const [loading, setLoading] = useState(upgradable)

  useEffect(() => {
    if (!upgradable) return
    let live = true
    apiFetch<{ brief: DashboardBrief }>('/api/ai/dashboard-brief')
      .then((data) => {
        if (live && data?.brief) setBrief(data.brief)
      })
      // Swallowed on purpose: the brief already on screen says the same thing.
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [upgradable])
  const count = brief.actions.length

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-4 sm:px-5">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3.5"
          aria-hidden
        >
          <Sparkles />
        </span>
        <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">{brief.headline}</h2>
        {brief.source === 'model' ? (
          <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
            AI
          </span>
        ) : null}
        {loading ? (
          <span className="ml-auto flex items-center gap-1.5 text-2xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Reading your figures…
          </span>
        ) : null}
      </div>

      <div
        key={brief.source}
        className="grid animate-fade-in-up gap-2 px-4 pt-2 text-[13px] leading-relaxed text-muted-foreground sm:grid-cols-2 sm:gap-5 sm:px-5"
      >
        <p>{brief.revenue}</p>
        <p>{brief.receivables}</p>
      </div>

      {count > 0 ? (
        <ul
          className={cn(
            'mt-4 grid divide-y divide-border border-t border-border sm:divide-x sm:divide-y-0',
            count === 2 && 'sm:grid-cols-2',
            count >= 3 && 'sm:grid-cols-3',
          )}
        >
          {brief.actions.map((item) => (
            <li key={item.title} className="min-w-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className="group flex h-full flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:px-5"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    {item.title}
                    <ArrowRight
                      className="size-3.5 text-muted-foreground transition-transform duration-150 ease-out-quint group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <span className="text-2xs leading-relaxed text-muted-foreground">{item.detail}</span>
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-1 px-4 py-3.5 sm:px-5">
                  <span className="text-[13px] font-semibold text-foreground">{item.title}</span>
                  <span className="text-2xs leading-relaxed text-muted-foreground">{item.detail}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

export { AiBrief }
