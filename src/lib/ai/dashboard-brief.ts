/**
 * The dashboard, explained.
 *
 * The cards already show the numbers; this says what they mean and what to do
 * next. Three short paragraphs — money in, money owed — and a to-do list ranked
 * by what it is worth chasing.
 *
 * Two rules make it trustworthy. Every figure is computed by Postgres and
 * formatted here, so the model narrates arithmetic it never performed: it is
 * given "INR 1,84,500 collected this month" and asked to explain it, not asked
 * to add anything up. And each recommendation carries a `target` from a closed
 * list, which this module turns into a link — the model never writes a URL.
 *
 * With no key, or on any failure, `briefFromRules` answers instead. It is not a
 * stub: it says the same things in the same shape, just in sentences written
 * ahead of time. The card on the dashboard is never empty and never errors.
 */

import { formatMoney } from '@/lib/money'
import { pluralise } from '@/lib/utils'
import type { DashboardStats, NeedsAttentionItem } from '@/types'
import { AiTransientError, AiUnavailableError, AiUnreadableError, groqChatJson } from './groq'

/** An invoice worth mentioning by name: overdue, or due within the week. */
export interface BriefInvoice {
  invoiceNumber: string
  clientName: string
  /** Minor units. */
  amount: number
  currency: string
  dueDate: string
  daysOverdue: number
  reminderCount: number
}

export interface BriefStats {
  totalEarned: number
  earnedThisMonth: number
  earnedPreviousMonth: number
  changePercent: number | null
  outstanding: number
  outstandingCount: number
  overdue: number
  overdueCount: number
  draftCount: number
  paidCount: number
  invoiceCount: number
  clientCount: number
}

export interface BriefContext {
  currency: string
  today: string
  stats: BriefStats
  attention: readonly BriefInvoice[]
}

/**
 * The dashboard's own figures, narrowed to what the brief may see.
 *
 * Client email addresses and invoice ids are dropped on the way through: the
 * model needs a name and an amount to write a sentence, and anything else that
 * leaves this process is data spent for nothing.
 */
export function briefContextFrom(
  stats: DashboardStats,
  attention: readonly NeedsAttentionItem[],
  today: string,
): BriefContext {
  return {
    currency: stats.currency,
    today,
    stats: {
      totalEarned: stats.totalEarned,
      earnedThisMonth: stats.totalEarnedThisMonth,
      earnedPreviousMonth: stats.totalEarnedPreviousMonth,
      changePercent: stats.earnedChangePercent,
      outstanding: stats.outstanding,
      outstandingCount: stats.outstandingCount,
      overdue: stats.overdue,
      overdueCount: stats.overdueCount,
      draftCount: stats.draftCount,
      paidCount: stats.paidCount,
      invoiceCount: stats.invoiceCount,
      clientCount: stats.clientCount,
    },
    attention: attention.slice(0, 5).map((item) => ({
      invoiceNumber: item.invoiceNumber,
      clientName: item.clientName,
      amount: item.amount,
      currency: item.currency,
      dueDate: item.dueDate,
      daysOverdue: item.daysOverdue,
      reminderCount: item.reminderCount,
    })),
  }
}

/**
 * Where a recommendation can point. A closed list because the alternative is a
 * model inventing `/invoices?status=urgent` and a card full of dead links.
 */
export type ActionTarget = 'overdue' | 'sent' | 'drafts' | 'new_invoice' | 'clients' | 'settings' | 'none'

const ACTION_HREF: Record<ActionTarget, string | null> = {
  overdue: '/invoices?status=overdue',
  sent: '/invoices?status=sent',
  drafts: '/invoices?status=draft',
  new_invoice: '/invoices/new',
  clients: '/clients',
  settings: '/settings',
  none: null,
}

const TARGETS = Object.keys(ACTION_HREF) as ActionTarget[]

export interface BriefAction {
  title: string
  detail: string
  target: ActionTarget
  /** Derived here from `target`, never from the model. */
  href: string | null
}

export interface DashboardBrief {
  headline: string
  revenue: string
  receivables: string
  actions: BriefAction[]
  source: 'model' | 'rules'
}

const MAX_ACTIONS = 3

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'revenue', 'receivables', 'actions'],
  properties: {
    headline: { type: 'string', description: 'The single most important thing right now, at most 12 words.' },
    revenue: { type: 'string', description: 'One or two sentences on what has come in and which way it is moving.' },
    receivables: { type: 'string', description: 'One or two sentences on what is owed and what is late.' },
    actions: {
      type: 'array',
      description: 'One to three recommendations, most valuable first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'target'],
        properties: {
          title: { type: 'string', description: 'An imperative, at most six words.' },
          detail: { type: 'string', description: 'One sentence saying why, using the figures given.' },
          target: { type: 'string', enum: TARGETS },
        },
      },
    },
  },
} as const

const SYSTEM = `You explain a freelancer's invoicing dashboard to the freelancer who owns it.

You are given figures that have already been calculated and formatted. Rules:
- Never compute, estimate or invent a number. Use only the figures given, copied exactly as written, including the currency code.
- Write in plain English, second person, present tense. No greetings, no emoji, no markdown, no exclamation marks, no hedging.
- headline: the single most important thing right now, at most 12 words, no full stop.
- revenue: what has come in, and whether that is up or down on last month. Say "no payments yet this month" if that is the case.
- receivables: what is owed and what is late. Name the one or two biggest overdue invoices by number and client. If nothing is overdue, say so.
- actions: 1 to 3, most valuable first. Chase money that is already late before anything else, then drafts that were never sent, then new work. Each detail must justify itself with a figure.
- Choose each action's target from: overdue (the overdue invoice list), drafts (unsent drafts), new_invoice (create one), clients (the client list), settings (business details), none.
- Do not suggest anything the figures do not support, and do not repeat the same action twice.`

/**
 * The figures, written out for a reader rather than serialised as JSON.
 *
 * Prose costs fewer tokens than a nested object and reads back more reliably: a
 * model told "INR 45,000 is overdue across 2 invoices" does not have to decide
 * what `overdue: 4500000` means, or which currency it is in.
 */
function factSheet({ currency, today, stats, attention }: BriefContext): string {
  const money = (minor: number) => formatMoney(minor, currency)
  const lines = [
    `Today: ${today}`,
    `Currency: ${currency}`,
    `Collected all time: ${money(stats.totalEarned)} across ${pluralise(stats.paidCount, 'paid invoice')}`,
    `Collected this month: ${money(stats.earnedThisMonth)}`,
    `Collected last month: ${money(stats.earnedPreviousMonth)}`,
  ]
  if (stats.changePercent !== null) {
    const direction = stats.changePercent >= 0 ? 'up' : 'down'
    lines.push(`Month on month: ${direction} ${Math.abs(stats.changePercent)}% on last month`)
  } else if (stats.earnedPreviousMonth === 0) {
    lines.push('Month on month: no baseline, nothing was collected last month')
  }

  lines.push(
    `Awaiting payment: ${money(stats.outstanding)} across ${pluralise(stats.outstandingCount, 'sent invoice')}`,
    `Of that, overdue: ${money(stats.overdue)} across ${pluralise(stats.overdueCount, 'invoice')}`,
    `Drafts not yet sent: ${stats.draftCount}`,
    `Clients: ${stats.clientCount}`,
    `Invoices in total: ${stats.invoiceCount}`,
  )

  if (attention.length === 0) {
    lines.push('', 'Needs attention: nothing is overdue and nothing falls due this week.')
  } else {
    lines.push('', 'Needs attention:')
    for (const item of attention) {
      const when =
        item.daysOverdue > 0
          ? `${pluralise(item.daysOverdue, 'day')} overdue`
          : `due ${item.dueDate}`
      const reminders =
        item.reminderCount > 0 ? `${pluralise(item.reminderCount, 'reminder')} sent` : 'no reminders sent'
      lines.push(
        `- ${item.invoiceNumber} · ${item.clientName} · ${formatMoney(item.amount, item.currency)} · ${when} · ${reminders}`,
      )
    }
  }

  return lines.join('\n')
}

function collapse(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function isTarget(value: unknown): value is ActionTarget {
  return typeof value === 'string' && TARGETS.includes(value as ActionTarget)
}

/** Attaches the href a target maps to, so a caller only ever renders our routes. */
function action(title: string, detail: string, target: ActionTarget): BriefAction {
  return { title, detail, target, href: ACTION_HREF[target] }
}
/**
 * The brief without a model: the same three paragraphs and the same ranked
 * actions, assembled from the figures by hand.
 *
 * This is what runs on a deployment with no `GROQ_API_KEY`, and what covers for
 * the model on any failure. It reads a little more mechanically and it never
 * says anything untrue, which is the right trade for a card about money.
 */
export function briefFromRules(context: BriefContext): DashboardBrief {
  const { currency, stats, attention } = context
  const money = (minor: number) => formatMoney(minor, currency)

  const overdueItems = attention.filter((item) => item.daysOverdue > 0)
  const dueSoon = attention.filter((item) => item.daysOverdue === 0)
  const biggest = [...overdueItems].sort((a, b) => b.amount - a.amount)[0]
  const oldest = overdueItems[0]

  const headline =
    stats.overdueCount > 0
      ? `${money(stats.overdue)} overdue across ${pluralise(stats.overdueCount, 'invoice')}`
      : dueSoon.length > 0
        ? `${pluralise(dueSoon.length, 'invoice')} falling due this week`
        : stats.outstanding > 0
          ? `${money(stats.outstanding)} out with clients, none of it late`
          : stats.draftCount > 0
            ? `${pluralise(stats.draftCount, 'draft')} waiting to be sent`
            : 'Nothing outstanding — you are all paid up'

  const thisMonth =
    stats.earnedThisMonth > 0
      ? `${money(stats.earnedThisMonth)} has been paid to you this month`
      : 'Nothing has been paid to you this month yet'
  const comparison =
    stats.changePercent !== null
      ? `, ${Math.abs(stats.changePercent)}% ${stats.changePercent >= 0 ? 'up on' : 'down on'} last month's ${money(stats.earnedPreviousMonth)}`
      : stats.earnedThisMonth > 0
        ? ', with nothing collected last month to compare against'
        : ''
  const revenue = `${thisMonth}${comparison}. ${money(stats.totalEarned)} collected in total across ${pluralise(stats.paidCount, 'paid invoice')}.`
  let receivables: string
  if (stats.outstanding === 0) {
    receivables =
      stats.paidCount > 0
        ? 'Nothing is outstanding: every invoice you have sent has been paid.'
        : 'Nothing is outstanding yet, because nothing has been sent.'
  } else {
    const out = `${money(stats.outstanding)} is with clients across ${pluralise(stats.outstandingCount, 'sent invoice')}.`
    if (stats.overdueCount > 0 && biggest && oldest) {
      const named = `${biggest.invoiceNumber} for ${biggest.clientName} at ${money(biggest.amount)}`
      const late =
        biggest.invoiceNumber === oldest.invoiceNumber
          ? `${pluralise(biggest.daysOverdue, 'day')} late`
          : `${pluralise(oldest.daysOverdue, 'day')} being the longest wait`
      receivables = `${out} ${money(stats.overdue)} of it is past due — the largest is ${named}, with ${late}.`
    } else {
      receivables = `${out} None of it is late yet.`
    }
  }

  const actions: BriefAction[] = []

  if (stats.overdueCount > 0) {
    const oldestNote = oldest ? ` The oldest, ${oldest.invoiceNumber}, is ${pluralise(oldest.daysOverdue, 'day')} past its due date.` : ''
    actions.push(
      action(
        'Chase what is overdue',
        `${money(stats.overdue)} across ${pluralise(stats.overdueCount, 'invoice')} is past due.${oldestNote} A reminder is one click from the list.`,
        'overdue',
      ),
    )
  }

  if (stats.draftCount > 0) {
    const one = stats.draftCount === 1
    actions.push(
      action(
        one ? 'Send the draft' : 'Send the drafts',
        `${pluralise(stats.draftCount, 'draft')} ${one ? 'is' : 'are'} written but unsent, so ${one ? 'it is' : 'they are'} not on the way to being paid.`,
        'drafts',
      ),
    )
  }

  if (dueSoon.length > 0 && actions.length < MAX_ACTIONS) {
    const next = dueSoon[0]!
    actions.push(
      action(
        'Get ahead of this week',
        `${pluralise(dueSoon.length, 'invoice')} falls due within the week, starting with ${next.invoiceNumber} for ${next.clientName} on ${next.dueDate}.`,
        'sent',
      ),
    )
  }
  if (stats.clientCount === 0) {
    actions.push(action('Add your first client', 'An invoice needs somebody to bill. A name and an email is enough.', 'clients'))
  } else if (actions.length < MAX_ACTIONS) {
    actions.push(
      action(
        'Bill the next job',
        stats.invoiceCount === 0
          ? 'Nothing has been invoiced yet. Describe the work and the line items fill themselves in.'
          : `You have ${pluralise(stats.clientCount, 'client')} on the books. Anything delivered and not yet invoiced is money sitting still.`,
        'new_invoice',
      ),
    )
  }

  return { headline, revenue, receivables, actions: actions.slice(0, MAX_ACTIONS), source: 'rules' }
}

/**
 * Reads the model's answer, keeping only what is usable.
 *
 * Returns `null` rather than a half-filled brief: a summary missing its revenue
 * paragraph is worse than the deterministic one, so a bad answer falls back
 * wholesale instead of being patched up.
 */
function briefFromModel(raw: unknown): DashboardBrief | null {
  if (typeof raw !== 'object' || raw === null) return null
  const source = raw as Record<string, unknown>

  const headline = collapse(source.headline)
  const revenue = collapse(source.revenue)
  const receivables = collapse(source.receivables)
  if (!headline || !revenue || !receivables) return null

  const actions: BriefAction[] = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(source.actions) ? source.actions : []) {
    if (typeof entry !== 'object' || entry === null) continue
    const item = entry as Record<string, unknown>
    const title = collapse(item.title)
    const detail = collapse(item.detail)
    const target = isTarget(item.target) ? item.target : 'none'
    if (!title || !detail || seen.has(target === 'none' ? title.toLowerCase() : target)) continue
    seen.add(target === 'none' ? title.toLowerCase() : target)
    actions.push(action(title, detail, target))
    if (actions.length === MAX_ACTIONS) break
  }
  if (actions.length === 0) return null

  return { headline: headline.replace(/[.!]$/, ''), revenue, receivables, actions, source: 'model' }
}
/**
 * The brief, model first.
 *
 * Every failure lands on the rules: no key, a rejected key, a refusal, a
 * timeout. Unlike the invoice composer — where a transient error must surface,
 * because the user asked for their own words to be read and quietly answering
 * with something else would be wrong — nobody asked for these sentences in
 * particular. They asked what the numbers mean, and the deterministic answer
 * means the same thing. So this never throws.
 */
export async function buildDashboardBrief(context: BriefContext): Promise<DashboardBrief> {
  try {
    const raw = await groqChatJson({
      system: SYSTEM,
      user: factSheet(context),
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'dashboard_brief',
      maxTokens: 900,
    })
    return briefFromModel(raw) ?? briefFromRules(context)
  } catch (error) {
    if (
      error instanceof AiUnavailableError ||
      error instanceof AiUnreadableError ||
      error instanceof AiTransientError
    ) {
      return briefFromRules(context)
    }
    throw error
  }
}
