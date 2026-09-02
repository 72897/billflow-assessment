/**
 * Domain types shared by the server and the browser.
 *
 * Two conventions hold everywhere:
 *   - every monetary field is an integer count of minor units (paise / cents),
 *     named `...Minor` where ambiguity is possible;
 *   - every date is an ISO string - `YYYY-MM-DD` for calendar dates and a full
 *     ISO-8601 instant for timestamps - never a `Date`, so payloads can cross
 *     the server/client boundary unchanged.
 */

import type { DiscountType } from '@/lib/invoice/calc'
import type { DisplayStatus, StoredStatus } from '@/lib/invoice/status'

export type { DiscountType, DisplayStatus, StoredStatus }

export interface BusinessSettings {
  id: string
  userId: string
  businessName: string
  businessEmail: string
  phone: string
  address: string
  taxId: string
  logoUrl: string | null
  currency: string
  invoicePrefix: string
  nextInvoiceNumber: number
  /** Basis points: 18% -> 1800. */
  defaultTaxRate: number
  defaultNotes: string
  paymentTermsDays: number
  createdAt: string
  updatedAt: string
}

/** Branding frozen onto an invoice when it is created. */
export interface BusinessSnapshot {
  businessName: string
  businessEmail: string
  phone: string
  address: string
  taxId: string
  logoUrl: string | null
}

export interface Client {
  id: string
  userId: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  notes: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientFinancials {
  invoiceCount: number
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
  paidCount: number
  outstandingCount: number
  overdueCount: number
}

export interface ClientWithFinancials extends Client {
  financials: ClientFinancials
}

export interface InvoiceItem {
  id: string
  description: string
  detail: string
  /** Thousandths: 1.5 -> 1500. */
  quantity: number
  /** Minor units. */
  rate: number
  /** Minor units. */
  amount: number
  position: number
}

export interface InvoiceTotals {
  subtotal: number
  discountType: DiscountType | null
  /** Basis points when percentage, minor units when fixed. */
  discountValue: number
  discountAmount: number
  /** Basis points: 18% -> 1800. */
  taxRate: number
  taxAmount: number
  total: number
}

/** Row shape used by the invoice list and dashboard tables. */
export interface InvoiceListItem extends InvoiceTotals {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  status: StoredStatus
  displayStatus: DisplayStatus
  currency: string
  clientId: string
  clientName: string
  clientCompany: string
  clientEmail: string
  sentAt: string | null
  paidAt: string | null
  firstViewedAt: string | null
  lastViewedAt: string | null
  viewCount: number
  reminderCount: number
  hasPublicLink: boolean
  itemCount: number
  createdAt: string
}

export interface InvoiceEvent {
  id: string
  type:
    | 'created'
    | 'updated'
    | 'sent'
    | 'viewed'
    | 'reminder_sent'
    | 'link_revoked'
    | 'link_regenerated'
    | 'payment_received'
    | 'duplicated'
  metadata: Record<string, unknown>
  createdAt: string
}

export interface Payment {
  id: string
  invoiceId: string
  amount: number
  currency: string
  method: 'card' | 'bank_transfer' | 'manual'
  reference: string
  status: 'succeeded' | 'failed' | 'pending'
  cardLast4: string | null
  payerNote: string
  paidAt: string
  createdAt: string
}

/** Everything the internal invoice page needs, in one payload. */
export interface InvoiceDetail extends InvoiceListItem {
  notes: string
  publicToken: string | null
  reminderSentAt: string | null
  archivedAt: string | null
  updatedAt: string
  items: InvoiceItem[]
  client: Client
  business: BusinessSnapshot
  events: InvoiceEvent[]
  payments: Payment[]
}

/** The projection served to an unauthenticated visitor. Deliberately narrow. */
export interface PublicInvoice {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  displayStatus: DisplayStatus
  currency: string
  subtotal: number
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  notes: string
  items: InvoiceItem[]
  business: BusinessSnapshot
  client: {
    name: string
    company: string
    email: string
    address: string
    phone: string
  }
  paidAt: string | null
  payment: {
    reference: string
    amount: number
    method: Payment['method']
    cardLast4: string | null
    paidAt: string
  } | null
}

export interface Paginated<T> {
  rows: T[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface DashboardStats {
  currency: string
  totalEarned: number
  totalEarnedThisMonth: number
  totalEarnedPreviousMonth: number
  /** Percent change vs the previous month, or null when there is no baseline. */
  earnedChangePercent: number | null
  outstanding: number
  outstandingCount: number
  overdue: number
  overdueCount: number
  draftCount: number
  paidCount: number
  sentCount: number
  invoiceCount: number
  clientCount: number
}

export interface IncomePoint {
  /** `YYYY-MM-DD` (day buckets) or `YYYY-MM-01` (month buckets). */
  date: string
  label: string
  amount: number
}

export type IncomeRange = 'this_month' | 'last_30_days' | 'this_year' | 'last_12_months'

export interface NeedsAttentionItem {
  id: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  amount: number
  currency: string
  dueDate: string
  daysOverdue: number
  displayStatus: DisplayStatus
  reminderCount: number
  reminderSentAt: string | null
  hasPublicLink: boolean
}

export interface DashboardData {
  stats: DashboardStats
  income: { range: IncomeRange; granularity: 'day' | 'month'; points: IncomePoint[]; total: number }
  needsAttention: NeedsAttentionItem[]
  recentInvoices: InvoiceListItem[]
}

/** Uniform envelope for every JSON endpoint. */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code: string; fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> } }
