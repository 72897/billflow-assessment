/**
 * The dashboard brief's deterministic half.
 *
 * `briefFromRules` is not a placeholder — it is what a deployment with no API key
 * reads, and what covers for the model on a timeout — so it gets the same
 * scrutiny the model path would if it could be tested offline.
 *
 * Two invariants matter here. The sentences must never claim a number the figures
 * do not contain, and every recommended action must resolve to a route this app
 * actually serves.
 */

import { describe, expect, it } from 'vitest'
import { briefFromRules, type BriefContext, type BriefInvoice, type BriefStats } from '@/lib/ai/dashboard-brief'

/** Every href the brief is allowed to produce, as served by the app's routes. */
const ROUTES = new Set([
  '/invoices?status=overdue',
  '/invoices?status=sent',
  '/invoices?status=draft',
  '/invoices/new',
  '/clients',
  '/settings',
])

const STATS: BriefStats = {
  totalEarned: 52_000_000,
  earnedThisMonth: 18_450_000,
  earnedPreviousMonth: 21_000_000,
  changePercent: -12.1,
  outstanding: 9_200_000,
  outstandingCount: 4,
  overdue: 4_500_000,
  overdueCount: 2,
  draftCount: 3,
  paidCount: 12,
  invoiceCount: 19,
  clientCount: 5,
}

function invoice(overrides: Partial<BriefInvoice> = {}): BriefInvoice {
  return {
    invoiceNumber: 'INV-0007',
    clientName: 'Priya Nair',
    amount: 2_250_000,
    currency: 'INR',
    dueDate: '2026-08-20',
    daysOverdue: 14,
    reminderCount: 1,
    ...overrides,
  }
}

function context(overrides: Partial<BriefContext> = {}): BriefContext {
  return { currency: 'INR', today: '2026-09-03', stats: STATS, attention: [invoice()], ...overrides }
}

describe('briefFromRules — the narrative', () => {
  it('leads with the overdue money when there is any', () => {
    const brief = briefFromRules(context())

    expect(brief.source).toBe('rules')
    expect(brief.headline).toBe('INR 45,000 overdue across 2 invoices')
  })

  it('reports this month against last, in the direction the figures point', () => {
    const brief = briefFromRules(context())

    expect(brief.revenue).toContain('INR 1,84,500 has been paid to you this month')
    expect(brief.revenue).toContain('12.1% down on')
    expect(brief.revenue).toContain("last month's INR 2,10,000")
    expect(brief.revenue).toContain('INR 5,20,000 collected in total across 12 paid invoices')
  })

  it('says plainly when nothing has come in, and compares nothing to nothing', () => {
    const brief = briefFromRules(
      context({ stats: { ...STATS, earnedThisMonth: 0, earnedPreviousMonth: 0, changePercent: null } }),
    )

    expect(brief.revenue).toContain('Nothing has been paid to you this month yet')
    expect(brief.revenue).not.toContain('up on')
    expect(brief.revenue).not.toContain('down on')
  })

  it('names the biggest overdue invoice and how late the oldest is', () => {
    const brief = briefFromRules(
      context({
        attention: [
          invoice({ invoiceNumber: 'INV-0004', clientName: 'Kabir Shah', amount: 1_100_000, daysOverdue: 31 }),
          invoice({ invoiceNumber: 'INV-0009', clientName: 'Meera Iyer', amount: 3_400_000, daysOverdue: 6 }),
        ],
      }),
    )

    expect(brief.receivables).toContain('INR 92,000 is with clients across 4 sent invoices')
    expect(brief.receivables).toContain('the largest is INV-0009 for Meera Iyer at INR 34,000')
    expect(brief.receivables).toContain('31 days being the longest wait')
  })

  it('does not invent lateness when nothing is late', () => {
    const brief = briefFromRules(context({ stats: { ...STATS, overdue: 0, overdueCount: 0 }, attention: [] }))

    expect(brief.receivables).toContain('None of it is late yet')
    expect(brief.headline).toBe('INR 92,000 out with clients, none of it late')
  })

  it('reads an empty ledger as good news rather than inventing a problem', () => {
    const brief = briefFromRules(
      context({
        stats: { ...STATS, outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, draftCount: 0 },
        attention: [],
      }),
    )

    expect(brief.headline).toBe('Nothing outstanding — you are all paid up')
    expect(brief.receivables).toBe('Nothing is outstanding: every invoice you have sent has been paid.')
  })
})

describe('briefFromRules — the recommendations', () => {
  it('puts chasing late money first, and only ever links where the app can go', () => {
    const brief = briefFromRules(context())

    expect(brief.actions.length).toBeGreaterThan(0)
    expect(brief.actions.length).toBeLessThanOrEqual(3)
    expect(brief.actions[0]).toMatchObject({ title: 'Chase what is overdue', target: 'overdue' })
    expect(brief.actions[0]!.href).toBe('/invoices?status=overdue')
    expect(brief.actions[0]!.detail).toContain('INR 45,000 across 2 invoices')

    for (const item of brief.actions) {
      expect(item.href === null || ROUTES.has(item.href)).toBe(true)
    }
  })

  it('mentions unsent drafts, in the singular when there is one', () => {
    const one = briefFromRules(context({ stats: { ...STATS, draftCount: 1 } }))
    const many = briefFromRules(context())

    expect(one.actions.map((item) => item.title)).toContain('Send the draft')
    expect(one.actions.find((item) => item.target === 'drafts')?.detail).toContain('1 draft is written but unsent')
    expect(many.actions.find((item) => item.target === 'drafts')?.detail).toContain('3 drafts are written but unsent')
  })

  it('points at the week ahead when nothing is late yet', () => {
    const brief = briefFromRules(
      context({
        stats: { ...STATS, overdue: 0, overdueCount: 0, draftCount: 0 },
        attention: [invoice({ invoiceNumber: 'INV-0011', clientName: 'Rohan Mehta', daysOverdue: 0, dueDate: '2026-09-05' })],
      }),
    )

    const soon = brief.actions.find((item) => item.target === 'sent')
    expect(soon?.detail).toContain('INV-0011 for Rohan Mehta on 2026-09-05')
    expect(soon?.href).toBe('/invoices?status=sent')
  })

  it('asks a brand-new account for a client before anything else', () => {
    const brief = briefFromRules(
      context({
        stats: {
          ...STATS,
          totalEarned: 0,
          earnedThisMonth: 0,
          earnedPreviousMonth: 0,
          changePercent: null,
          outstanding: 0,
          outstandingCount: 0,
          overdue: 0,
          overdueCount: 0,
          draftCount: 0,
          paidCount: 0,
          invoiceCount: 0,
          clientCount: 0,
        },
        attention: [],
      }),
    )

    expect(brief.actions).toHaveLength(1)
    expect(brief.actions[0]).toMatchObject({ title: 'Add your first client', href: '/clients' })
  })
})
