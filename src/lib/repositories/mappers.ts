/**
 * Row mappers: raw SQL rows -> domain objects.
 *
 * Read queries always cast `numeric` and `date` columns to text in SQL, so both
 * drivers hand back exact strings. These helpers turn those strings into the
 * integer representations the rest of the app uses, and normalise timestamps to
 * ISO strings so a payload can cross into a client component untouched.
 */

import { fromDecimal, parseQuantityToThousandths } from '@/lib/money'
import type {
  BusinessSettings,
  BusinessSnapshot,
  Client,
  ClientFinancials,
  InvoiceEvent,
  InvoiceItem,
  InvoiceListItem,
  Payment,
} from '@/types'
import type { DiscountType } from '@/lib/invoice/calc'
import type { DisplayStatus, StoredStatus } from '@/lib/invoice/status'

/** Timestamp -> ISO string. Accepts the Date both drivers return, or a string. */
export function ts(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** Same as `ts`, for columns declared NOT NULL. */
export function tsRequired(value: unknown): string {
  return ts(value) ?? new Date(0).toISOString()
}

/** numeric(_,2) text -> integer minor units / basis points. */
export function money(value: unknown): number {
  return fromDecimal(value as string | number | null)
}

/** numeric(12,3) text -> integer thousandths. */
export function quantity(value: unknown): number {
  return parseQuantityToThousandths(value as string) ?? 0
}

export function int(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function text(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value)
}

// ---------------------------------------------------------------------------

export function mapSettings(row: Record<string, unknown>): BusinessSettings {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    businessName: text(row.business_name),
    businessEmail: text(row.business_email),
    phone: text(row.phone),
    address: text(row.address),
    taxId: text(row.tax_id),
    logoUrl: row.logo_url ? text(row.logo_url) : null,
    currency: text(row.currency, 'INR'),
    invoicePrefix: text(row.invoice_prefix, 'INV'),
    nextInvoiceNumber: int(row.next_invoice_number, 1),
    defaultTaxRate: money(row.default_tax_rate),
    defaultNotes: text(row.default_notes),
    paymentTermsDays: int(row.payment_terms_days, 14),
    createdAt: tsRequired(row.created_at),
    updatedAt: tsRequired(row.updated_at),
  }
}

export function snapshotFromSettings(settings: BusinessSettings): BusinessSnapshot {
  return {
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    phone: settings.phone,
    address: settings.address,
    taxId: settings.taxId,
    logoUrl: settings.logoUrl,
  }
}

/**
 * Reads the frozen snapshot from an invoice, falling back to live settings for
 * invoices created before a snapshot existed.
 */
export function mapSnapshot(raw: unknown, fallback: BusinessSnapshot): BusinessSnapshot {
  const source = (typeof raw === 'string' ? safeJson(raw) : raw) as Partial<BusinessSnapshot> | null
  if (!source || typeof source !== 'object') return fallback
  return {
    businessName: source.businessName ?? fallback.businessName,
    businessEmail: source.businessEmail ?? fallback.businessEmail,
    phone: source.phone ?? fallback.phone,
    address: source.address ?? fallback.address,
    taxId: source.taxId ?? fallback.taxId,
    logoUrl: source.logoUrl ?? fallback.logoUrl,
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function mapClient(row: Record<string, unknown>): Client {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    name: text(row.name),
    company: text(row.company),
    email: text(row.email),
    phone: text(row.phone),
    address: text(row.address),
    notes: text(row.notes),
    archivedAt: ts(row.archived_at),
    createdAt: tsRequired(row.created_at),
    updatedAt: tsRequired(row.updated_at),
  }
}

export function mapFinancials(row: Record<string, unknown>): ClientFinancials {
  return {
    invoiceCount: int(row.invoice_count),
    totalBilled: money(row.total_billed),
    totalPaid: money(row.total_paid),
    totalOutstanding: money(row.total_outstanding),
    paidCount: int(row.paid_count),
    outstandingCount: int(row.outstanding_count),
    overdueCount: int(row.overdue_count),
  }
}

export function mapItem(row: Record<string, unknown>): InvoiceItem {
  return {
    id: text(row.id),
    description: text(row.description),
    detail: text(row.detail),
    quantity: quantity(row.quantity),
    rate: money(row.rate),
    amount: money(row.amount),
    position: int(row.position),
  }
}

export function mapEvent(row: Record<string, unknown>): InvoiceEvent {
  const metadata = typeof row.metadata === 'string' ? safeJson(row.metadata) : row.metadata
  return {
    id: text(row.id),
    type: text(row.type) as InvoiceEvent['type'],
    metadata: (metadata as Record<string, unknown>) ?? {},
    createdAt: tsRequired(row.created_at),
  }
}

export function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: text(row.id),
    invoiceId: text(row.invoice_id),
    amount: money(row.amount),
    currency: text(row.currency, 'INR'),
    method: text(row.method, 'manual') as Payment['method'],
    reference: text(row.reference),
    status: text(row.status, 'succeeded') as Payment['status'],
    cardLast4: row.card_last4 ? text(row.card_last4) : null,
    payerNote: text(row.payer_note),
    paidAt: tsRequired(row.paid_at),
    createdAt: tsRequired(row.created_at),
  }
}

export function mapInvoiceListItem(row: Record<string, unknown>): InvoiceListItem {
  return {
    id: text(row.id),
    invoiceNumber: text(row.invoice_number),
    issueDate: text(row.issue_date).slice(0, 10),
    dueDate: text(row.due_date).slice(0, 10),
    status: text(row.status, 'draft') as StoredStatus,
    displayStatus: text(row.display_status, 'draft') as DisplayStatus,
    currency: text(row.currency, 'INR'),
    clientId: text(row.client_id),
    clientName: text(row.client_name),
    clientCompany: text(row.client_company),
    clientEmail: text(row.client_email),
    subtotal: money(row.subtotal),
    discountType: (row.discount_type ? text(row.discount_type) : null) as DiscountType | null,
    discountValue: money(row.discount_value),
    discountAmount: money(row.discount_amount),
    taxRate: money(row.tax_rate),
    taxAmount: money(row.tax_amount),
    total: money(row.total),
    sentAt: ts(row.sent_at),
    paidAt: ts(row.paid_at),
    firstViewedAt: ts(row.first_viewed_at),
    lastViewedAt: ts(row.last_viewed_at),
    viewCount: int(row.view_count),
    reminderCount: int(row.reminder_count),
    hasPublicLink: row.has_public_link === true || row.has_public_link === 't',
    itemCount: int(row.item_count),
    createdAt: tsRequired(row.created_at),
  }
}
