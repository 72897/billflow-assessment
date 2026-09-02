/**
 * Demo data.
 *
 * Two rules shape this file. Every date is an offset from *today*, so a demo
 * recorded next month still shows fresh invoices, a genuinely overdue one and a
 * payment in the current calendar month for the dashboard chart. And every total
 * is computed with the same `calculateInvoice()` the app uses, so seeded rows are
 * indistinguishable from rows a user created by hand - no hand-typed totals that
 * could disagree with the arithmetic.
 *
 * Money is in minor units (paise), quantities in thousandths, rates in basis
 * points, exactly as everywhere else.
 */

import type { DiscountType, StoredStatus } from '@/types'

export interface SeedClient
  extends Record<'name' | 'company' | 'email' | 'phone' | 'address' | 'notes', string> {
  key: string
  archived?: boolean
}

export interface SeedItem {
  description: string
  detail: string
  /** Thousandths. */
  quantity: number
  /** Minor units. */
  rate: number
}

export interface SeedInvoice {
  client: string
  /** Days from today; negative is the past. */
  issue: number
  due: number
  status: StoredStatus
  /** Days from today the payment landed. Required when `status` is `paid`. */
  paid?: number
  /** Days from today the invoice was emailed. Defaults to the issue date. */
  sent?: number
  discountType?: DiscountType
  /** Basis points for a percentage discount, minor units for a fixed one. */
  discountValue?: number
  /** Basis points: 18% GST -> 1800. */
  taxRate: number
  notes: string
  items: SeedItem[]
  /** Mint a share link, so the demo has a public URL to open. */
  share?: boolean
  views?: number
  reminders?: number
  /** Days from today the last reminder went out. */
  remindedAt?: number
  method?: 'card' | 'bank_transfer' | 'manual'
}

export const SEED_CLIENTS: SeedClient[] = [
  {
    key: 'lumen',
    name: 'Priya Nair',
    company: 'Lumen Retail Pvt Ltd',
    email: 'priya.nair@lumenretail.in',
    phone: '+91 98200 41122',
    address: '4th Floor, Kalpataru Prime\nSion East, Mumbai 400022\nMaharashtra, India',
    notes: 'Prefers a Monday kickoff call. Purchase order number must appear on every invoice.',
  },
  {
    key: 'northwind',
    name: 'Rohan Mehta',
    company: 'Northwind Coffee Roasters',
    email: 'rohan@northwindcoffee.co',
    phone: '+91 99878 30456',
    address: '12 Brigade Terrace\nRichmond Town, Bengaluru 560025\nKarnataka, India',
    notes: 'Pays by NEFT, usually within a week. Loops in accounts@ for anything over ₹1,00,000.',
  },
  {
    key: 'verve',
    name: 'Dr. Ananya Rao',
    company: 'Verve Health',
    email: 'ananya.rao@vervehealth.in',
    phone: '+91 90040 77219',
    address: 'Plot 22, Cyber Gateway\nHITEC City, Hyderabad 500081\nTelangana, India',
    notes: 'Registered outside India for two entities - check GST applicability per project.',
  },
  {
    key: 'tidal',
    name: 'Kabir Shah',
    company: 'Tidal Labs',
    email: 'kabir@tidallabs.io',
    phone: '+91 87654 20011',
    address: 'WeWork Galaxy, 43 Residency Road\nBengaluru 560025\nKarnataka, India',
    notes: 'Early-stage, occasionally slow. Worth a nudge a couple of days before the due date.',
  },
  {
    key: 'saffron',
    name: 'Meera Iyer',
    company: 'Saffron Kitchen',
    email: 'meera@saffronkitchen.in',
    phone: '+91 96540 88123',
    address: '7 Church Street\nFort Kochi, Kochi 682001\nKerala, India',
    notes: 'Packaging work is seasonal - expect a burst before Onam and Diwali.',
  },
  {
    key: 'oldclient',
    name: 'Vikram Desai',
    company: 'Desai & Co.',
    email: 'vikram@desaico.in',
    phone: '+91 93210 55600',
    address: '18 Marine Lines\nMumbai 400020\nMaharashtra, India',
    notes: 'Retired the retainer in March. Archived rather than deleted so the history survives.',
    archived: true,
  },
]

const TERMS = 'Payment due within 14 days of the issue date. NEFT / IMPS preferred - bank details on request.'
const THANKS = 'Thank you for the work - it has been a genuinely good project to be part of.'

/**
 * A day offset landing in the middle of the *previous* calendar month.
 *
 * Plain day offsets cannot guarantee that, and the dashboard compares this month's
 * income against last month's - with nothing in last month there is no comparison
 * to show, whatever date the demo is seeded on.
 */
const MID_LAST_MONTH = (() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(today.getFullYear(), today.getMonth() - 1, 15)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
})()

/**
 * Fourteen invoices, ordered oldest issue date first so the numbers they are
 * given run in sequence like a real book: seven months of settled income for the
 * chart, two genuinely overdue, two in flight (one of them the payable demo
 * link), and two drafts.
 */
export const SEED_INVOICES: SeedInvoice[] = [
  {
    client: 'lumen',
    issue: -232,
    due: -218,
    status: 'paid',
    paid: -215,
    taxRate: 1800,
    notes: TERMS,
    method: 'bank_transfer',
    views: 3,
    items: [
      { description: 'Brand identity system', detail: 'Logo, palette, type scale and a usage guide', quantity: 1000, rate: 12000000 },
      { description: 'Stationery design', detail: 'Letterhead, business card, email signature', quantity: 3000, rate: 850000 },
    ],
  },
  {
    client: 'northwind',
    issue: -201,
    due: -187,
    status: 'paid',
    paid: -184,
    discountType: 'percentage',
    discountValue: 1000,
    taxRate: 1800,
    notes: `${TERMS}\n\nIntroductory 10% applied to the first project, as agreed on the call.`,
    method: 'bank_transfer',
    views: 2,
    items: [
      { description: 'Packaging design', detail: 'Three SKUs, print-ready artwork', quantity: 3000, rate: 2200000 },
      { description: 'Illustration set', detail: '12 custom spot illustrations', quantity: 12000, rate: 350000 },
    ],
  },
  {
    client: 'verve',
    issue: -172,
    due: -158,
    status: 'paid',
    paid: -150,
    taxRate: 0,
    notes: `${TERMS}\n\nZero-rated: services exported under LUT, no GST charged.`,
    method: 'bank_transfer',
    views: 4,
    items: [
      { description: 'UX audit', detail: 'Heuristic review of the patient portal, with a written report', quantity: 1000, rate: 4500000 },
      { description: 'Consulting call', detail: 'Two strategy sessions with the product team', quantity: 2000, rate: 600000 },
    ],
  },
  {
    client: 'lumen',
    issue: -141,
    due: -127,
    status: 'paid',
    paid: -124,
    discountType: 'fixed',
    discountValue: 500000,
    taxRate: 1800,
    notes: `${TERMS}\n\nPO 4417-LR. ₹5,000 goodwill credit for the delayed handover.`,
    method: 'bank_transfer',
    views: 2,
    items: [
      { description: 'Website design', detail: 'Six responsive templates, Figma source included', quantity: 1000, rate: 9500000 },
      { description: 'Prototype', detail: 'Interactive prototype for user testing', quantity: 1000, rate: 3500000 },
    ],
  },
  {
    client: 'tidal',
    issue: -110,
    due: -96,
    status: 'paid',
    paid: -88,
    taxRate: 1800,
    notes: `${TERMS}\n\nSettled a little late - no hard feelings.`,
    method: 'card',
    views: 6,
    reminders: 1,
    remindedAt: -92,
    items: [
      { description: 'Design retainer', detail: 'March - 40 hours', quantity: 40000, rate: 250000 },
    ],
  },
  {
    client: 'saffron',
    issue: -79,
    due: -65,
    status: 'paid',
    paid: MID_LAST_MONTH,
    discountType: 'percentage',
    discountValue: 500,
    taxRate: 1800,
    notes: `${TERMS}\n\n5% returning-client discount applied.`,
    method: 'bank_transfer',
    views: 5,
    reminders: 2,
    remindedAt: -48,
    items: [
      { description: 'Menu redesign', detail: 'Dine-in and takeaway, two languages', quantity: 1000, rate: 5600000 },
      { description: 'Photography direction', detail: 'One-day shoot, art direction and selects', quantity: 1000, rate: 3200000 },
    ],
  },
  {
    client: 'lumen',
    issue: -40,
    due: -18,
    status: 'sent',
    sent: -40,
    taxRate: 1800,
    notes: `${TERMS}\n\nPO 4610-LR. Second reminder sent - please confirm the payment date.`,
    views: 4,
    reminders: 2,
    remindedAt: -6,
    items: [
      { description: 'Campaign landing page', detail: 'Design and build for the winter launch', quantity: 1000, rate: 7800000 },
      { description: 'Copywriting', detail: 'Headlines and body copy, two rounds', quantity: 1000, rate: 2800000 },
    ],
  },
  {
    client: 'tidal',
    issue: -30,
    due: -9,
    status: 'sent',
    sent: -30,
    discountType: 'fixed',
    discountValue: 250000,
    taxRate: 1800,
    notes: `${TERMS}\n\nStartup credit of ₹2,500 applied.`,
    views: 2,
    reminders: 1,
    remindedAt: -3,
    items: [
      { description: 'Design retainer', detail: 'Monthly retainer - 32 hours', quantity: 32000, rate: 250000 },
      { description: 'Design system upkeep', detail: 'Component library maintenance', quantity: 1000, rate: 1800000 },
    ],
  },
  {
    client: 'northwind',
    issue: -20,
    due: -6,
    status: 'paid',
    paid: -1,
    taxRate: 1800,
    notes: `${TERMS}\n\n${THANKS}`,
    method: 'card',
    share: true,
    views: 3,
    items: [
      { description: 'Seasonal packaging refresh', detail: 'Two limited-edition bag designs', quantity: 2000, rate: 2400000 },
      { description: 'Front-end build', detail: 'Shop page implementation in Next.js', quantity: 1000, rate: 6500000 },
    ],
  },
  {
    client: 'verve',
    issue: -16,
    due: -2,
    status: 'paid',
    paid: 0,
    taxRate: 0,
    notes: `${TERMS}\n\nZero-rated: services exported under LUT, no GST charged.`,
    method: 'bank_transfer',
    views: 2,
    items: [
      { description: 'Onboarding flow redesign', detail: 'Five screens, mobile and desktop', quantity: 1000, rate: 6800000 },
    ],
  },
  {
    client: 'verve',
    issue: -6,
    due: 8,
    status: 'sent',
    sent: -6,
    discountType: 'percentage',
    discountValue: 500,
    taxRate: 1800,
    notes: `${TERMS}\n\nPay online with the button on this page - a receipt is emailed automatically.`,
    share: true,
    views: 3,
    items: [
      { description: 'Design sprint', detail: 'Four-day sprint with the clinical team', quantity: 1000, rate: 11000000 },
      { description: 'Usability testing', detail: 'Six moderated sessions, recorded, with a summary', quantity: 6000, rate: 750000 },
      { description: 'Consulting call', detail: 'Follow-up review session', quantity: 1000, rate: 600000 },
    ],
  },
  {
    client: 'saffron',
    issue: -2,
    due: 12,
    status: 'sent',
    sent: -2,
    taxRate: 1800,
    notes: TERMS,
    items: [
      { description: 'Festive campaign artwork', detail: 'Six social templates and one print poster', quantity: 1000, rate: 4200000 },
    ],
  },
  {
    client: 'northwind',
    issue: -1,
    due: 13,
    status: 'draft',
    taxRate: 1800,
    notes: `${TERMS}\n\nDraft - waiting on the final hour count for the second week.`,
    items: [
      { description: 'Design retainer', detail: 'This month - 24 hours', quantity: 24000, rate: 250000 },
      { description: 'Email template', detail: 'Responsive newsletter template', quantity: 1000, rate: 1600000 },
    ],
  },
  {
    client: 'lumen',
    issue: 0,
    due: 14,
    status: 'draft',
    taxRate: 1800,
    notes: 'Draft - scope still under discussion.',
    items: [
      { description: 'Q4 brand refresh', detail: 'Discovery workshop and moodboards', quantity: 1000, rate: 8500000 },
    ],
  },
]

/** The account the seeded data belongs to. */
export const SEED_PROFILE = {
  fullName: 'Aarav Sharma',
  businessName: 'Aarav Sharma Design',
  businessEmail: 'studio@aaravsharma.design',
  phone: '+91 98111 20345',
  address: 'Studio 3, 21 Hauz Khas Village\nNew Delhi 110016\nIndia',
  taxId: '07AABCU9603R1ZV',
  currency: 'INR',
  invoicePrefix: 'INV',
  /** Basis points: 18% GST. */
  defaultTaxRate: 1800,
  defaultNotes: TERMS,
  paymentTermsDays: 14,
} as const

