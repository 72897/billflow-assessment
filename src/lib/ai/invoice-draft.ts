/**
 * Plain language in, invoice draft out.
 *
 * "website design ₹25,000 with 18% GST, 10% off, net 14 for Acme" becomes line
 * items, a tax rate, a discount and a due date — as **strings**, in exactly the
 * shape `InvoiceFormValues` holds them, so applying a draft is assignment rather
 * than conversion. Every number the model returns is re-parsed here with the same
 * money helpers the server uses on submit, and the arithmetic is done locally:
 * the model is trusted to *read*, never to *calculate*.
 *
 * Two paths produce a draft, and the caller cannot tell which ran except by the
 * `source` field:
 *
 *   - `model` — Groq with a strict JSON schema, which handles prose, spelled-out
 *     amounts, lakh notation and multiple items in one sentence.
 *   - `rules` — a local regex parser, used when there is no API key, when the key
 *     is refused, or when the model declines. It is worse, not useless: it gets
 *     the common shapes right without a network call, which keeps the feature
 *     honest on a fresh clone. Same reasoning as the email outbox.
 */

import {
  formatQuantity,
  formatRate,
  isCurrencyCode,
  parseDecimalToMinor,
  parseQuantityToThousandths,
  parseRateToBasisPoints,
} from '@/lib/money'
import { MAX_LINE_ITEMS } from '@/lib/validation/invoice'
import { AiUnavailableError, AiUnreadableError, groqChatJson, hasAiProvider } from './groq'

export interface DraftClient {
  id: string
  name: string
  company: string
}

export interface DraftContext {
  clients: readonly DraftClient[]
  /** The account's currency, used when the text does not name one. */
  currency: string
  /** Default tax rate in basis points, offered to the model as the fallback. */
  defaultTaxRate: number
  paymentTermsDays: number
  /** ISO date the draft is relative to. Passed in so tests are not time-dependent. */
  today: string
}

export interface DraftItem {
  description: string
  detail: string
  quantity: string
  rate: string
  /** Minor units, computed here so the UI can preview a total without re-parsing. */
  amount: number
}

/** How confidently the named client was resolved to one of the user's own. */
export type ClientMatch = 'exact' | 'partial' | 'unknown' | 'none'

export interface InvoiceDraft {
  clientId: string | null
  clientName: string | null
  clientMatch: ClientMatch
  items: DraftItem[]
  currency: string | null
  taxRate: string | null
  discountType: 'percentage' | 'fixed' | null
  discountValue: string | null
  dueInDays: number | null
  notes: string | null
  summary: string
  /** Things the user should look at before saving. Never blocking. */
  warnings: string[]
  source: 'model' | 'rules'
}

/* -------------------------------------------------------------------------- */
/* The model contract                                                          */
/* -------------------------------------------------------------------------- */

const TEXT_OR_NULL = { type: ['string', 'null'] } as const

/**
 * The JSON Schema handed to Groq with `strict: true`.
 *
 * Every numeric field is a **string** on purpose. A JSON number would arrive as
 * a float — `25000.000000001` is a real thing to receive — and the whole money
 * layer of this app exists to keep floats away from amounts. A decimal string
 * goes through `parseDecimalToMinor` exactly like something typed into the form.
 */
const DRAFT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'clientName',
    'currency',
    'items',
    'taxRatePercent',
    'discountType',
    'discountValue',
    'dueInDays',
    'notes',
    'summary',
  ],
  properties: {
    clientName: TEXT_OR_NULL,
    currency: TEXT_OR_NULL,
    taxRatePercent: TEXT_OR_NULL,
    discountType: { type: ['string', 'null'], enum: ['percentage', 'fixed', null] },
    discountValue: TEXT_OR_NULL,
    dueInDays: { type: ['integer', 'null'] },
    notes: TEXT_OR_NULL,
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'detail', 'quantity', 'rate'],
        properties: {
          description: { type: 'string' },
          detail: { type: 'string' },
          quantity: { type: 'string' },
          rate: { type: 'string' },
        },
      },
    },
  },
}

interface ModelItem {
  description: unknown
  detail: unknown
  quantity: unknown
  rate: unknown
}

interface ModelDraft {
  clientName: unknown
  currency: unknown
  taxRatePercent: unknown
  discountType: unknown
  discountValue: unknown
  dueInDays: unknown
  notes: unknown
  summary: unknown
  items: unknown
}

/**
 * The system prompt.
 *
 * Client names are listed so "for Acme" resolves to the row that already exists
 * rather than to a new spelling of it — but only the names go over the wire, and
 * the model is never given an id to return. Matching an id is done locally, so a
 * hallucinated identifier cannot select somebody else's client.
 */
function systemPrompt(context: DraftContext): string {
  const names = context.clients
    .slice(0, 60)
    .map((client) => (client.company && client.company !== client.name ? `${client.name} (${client.company})` : client.name))
    .join('; ')

  return [
    "You convert a freelancer's plain-language note into invoice line items.",
    '',
    'Rules:',
    '- Return every number as a plain decimal string: no currency symbols, no thousands separators, no words. "40k" is "40000", "1.2 lakh" is "120000".',
    '- `rate` is the price of ONE unit in major currency units. `quantity` defaults to "1".',
    '- "6 hours at 1500" is quantity "6", rate "1500" — never multiply them out.',
    '- Split distinct pieces of work into separate items. Keep `description` short, like a line on a bill.',
    '- `detail` is an optional second line. Use it only to add information the description does not already carry; otherwise return an empty string. Never repeat the description.',
    '- Never invent work, amounts, quantities or clients that the note does not mention. Leave a field null rather than guessing.',
    '- If a tax is named (GST, VAT, sales tax), put its percentage in `taxRatePercent` as a string. Otherwise null.',
    '- A discount is `percentage` when written with % and `fixed` when it is an amount. `discountValue` is the bare number.',
    '- "net 30", "due in 2 weeks", "payable within 10 days" all set `dueInDays` as an integer number of days.',
    '- `notes` is for a message to the client that is not a line item. Usually null.',
    '- `summary` is one short sentence, addressed to the freelancer, saying what you filled in.',
    '',
    names ? `The user's existing clients: ${names}. Return the client's name exactly as listed when the note refers to one of them.` : 'The user has no clients yet.',
    `Today is ${context.today}. The default currency is ${context.currency}; only set \`currency\` if the note clearly names a different one.`,
    `Their usual payment terms are ${context.paymentTermsDays} days, but leave \`dueInDays\` null unless the note mentions timing.`,
    context.defaultTaxRate > 0
      ? `Their usual tax rate is ${formatRate(context.defaultTaxRate)}%, but do not apply it unless the note mentions tax.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/* -------------------------------------------------------------------------- */
/* Normalisation — the model reads, this file calculates                       */
/* -------------------------------------------------------------------------- */

function collapse(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Sentence-cases the first letter only, so "iOS build" and "SEO setup" survive. */
function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

/** Minor units back to the string a person would have typed into the field. */
function minorToInput(minor: number): string {
  const rounded = Math.round(minor)
  const abs = Math.abs(rounded)
  const sign = rounded < 0 ? '-' : ''
  const whole = Math.floor(abs / 100)
  const fraction = abs % 100
  if (fraction === 0) return `${sign}${whole}`
  const padded = String(fraction).padStart(2, '0')
  return `${sign}${whole}.${padded.endsWith('0') ? padded.slice(0, 1) : padded}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Empty strings are how a model says null when the schema allows both. */
function textOrNull(value: unknown, max: number): string | null {
  const text = collapse(value, max)
  return text === '' || /^(null|none|n\/a|unknown)$/i.test(text) ? null : text
}

function comparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Resolves a name to one of the user's own clients.
 *
 * The id comes from this list and nowhere else, which is what makes the whole
 * feature safe: whatever the model says, the draft can only ever point at a
 * client the caller already loaded for this user.
 *
 * An unmatched name is not an error — it is how "for a new client" reads — so it
 * comes back as `unknown` with the name intact, and the UI offers to add them.
 */
function matchClient(
  name: string | null,
  clients: readonly DraftClient[],
): { clientId: string | null; clientName: string | null; clientMatch: ClientMatch } {
  if (!name) return { clientId: null, clientName: null, clientMatch: 'none' }

  const needle = comparable(name)
  if (!needle) return { clientId: null, clientName: null, clientMatch: 'none' }

  const candidates = clients.map((client) => ({
    client,
    keys: [comparable(client.name), comparable(client.company)].filter(Boolean),
  }))

  const exact = candidates.find((entry) => entry.keys.includes(needle))
  if (exact) return { clientId: exact.client.id, clientName: exact.client.name, clientMatch: 'exact' }

  // "Acme" for "Acme Technologies", or "Acme Technologies Pvt Ltd" for "Acme
  // Technologies" — one containing the other is a match worth offering, but it
  // is reported as partial so the UI can say which client it chose.
  const partial = candidates.find((entry) =>
    entry.keys.some((key) => (needle.length >= 4 && key.includes(needle)) || (key.length >= 4 && needle.includes(key))),
  )
  if (partial) return { clientId: partial.client.id, clientName: partial.client.name, clientMatch: 'partial' }

  return { clientId: null, clientName: name, clientMatch: 'unknown' }
}

/** What both paths produce, before any of it is trusted. */
interface DraftParts {
  clientName: string | null
  currency: string | null
  taxRatePercent: string | null
  discountType: 'percentage' | 'fixed' | null
  discountValue: string | null
  dueInDays: number | null
  notes: string | null
  summary: string
  items: Array<{ description: string; detail: string; quantity: string; rate: string }>
}

/** Cleans each row and prices it here, with the app's own money helpers. */
function normaliseItems(raw: DraftParts['items'], warnings: string[]): DraftItem[] {
  const kept = raw.slice(0, MAX_LINE_ITEMS)
  if (raw.length > kept.length) warnings.push(`Only the first ${MAX_LINE_ITEMS} lines were kept.`)

  const items: DraftItem[] = []
  for (const row of kept) {
    const description = capitalise(collapse(row.description, 200))
    let detail = collapse(row.detail, 300)
    // Models like to echo the description into the detail, which then prints the
    // same words twice on the invoice. Drop it when it adds nothing.
    if (detail && comparable(description).includes(comparable(detail))) detail = ''

    const parsedQuantity = parseQuantityToThousandths(row.quantity)
    const quantity = parsedQuantity !== null && parsedQuantity > 0 ? parsedQuantity : 1000

    const parsedRate = parseDecimalToMinor(row.rate)
    const rate = parsedRate !== null && parsedRate > 0 ? parsedRate : 0

    // A row with neither a name nor a price carries nothing worth applying.
    if (description === '' && rate === 0) continue

    items.push({
      description,
      detail,
      quantity: formatQuantity(quantity),
      // An unpriced row leaves the field empty rather than writing a literal "0":
      // the placeholder invites a rate, and "0" has to be deleted before typing.
      rate: rate === 0 ? '' : minorToInput(rate),
      amount: Math.round((quantity * rate) / 1000),
    })
  }

  // Said once, after the loop, so ten unpriced rows do not produce ten warnings
  // that push the useful ones off the screen.
  const unpriced = items.filter((item) => item.amount === 0)
  if (unpriced.length === 1) {
    warnings.push(`No amount was mentioned for “${unpriced[0]!.description}” — add the rate.`)
  } else if (unpriced.length > 1) {
    warnings.push(`${unpriced.length} lines have no amount yet — add their rates.`)
  }
  if (items.some((item) => item.description === '')) warnings.push('One line still needs a description.')

  return items
}

/**
 * Turns loosely-parsed parts into a draft that is safe to apply.
 *
 * Nothing here takes a value on faith: percentages are clamped to 0–100, a
 * discount without a type is dropped rather than guessed at, a currency has to
 * be one this app supports, and a due date beyond a year is treated as a
 * misread. The result is a draft that cannot put the form into a state the
 * validation schema would reject.
 */
function assemble(parts: DraftParts, context: DraftContext, source: 'model' | 'rules'): InvoiceDraft {
  const warnings: string[] = []
  const items = normaliseItems(parts.items, warnings)

  const named = parts.currency?.trim().toUpperCase() ?? null
  const currency = named && isCurrencyCode(named) && named !== context.currency ? named : null
  if (currency) warnings.push(`The amounts read as ${currency}, so the currency was switched.`)

  const taxBasisPoints = parts.taxRatePercent === null ? null : parseRateToBasisPoints(parts.taxRatePercent)
  const taxRate = taxBasisPoints === null ? null : formatRate(clamp(taxBasisPoints, 0, 10_000))

  const discountMinor = parts.discountValue === null ? null : parseDecimalToMinor(parts.discountValue)
  const hasDiscount = parts.discountType !== null && discountMinor !== null && discountMinor > 0
  const discountType = hasDiscount ? parts.discountType : null
  const discountValue = hasDiscount
    ? minorToInput(discountType === 'percentage' ? clamp(discountMinor!, 0, 10_000) : discountMinor!)
    : null

  const dueInDays = parts.dueInDays === null ? null : clamp(Math.round(parts.dueInDays), 0, 365)

  const { clientId, clientName, clientMatch } = matchClient(parts.clientName, context.clients)
  if (clientMatch === 'unknown' && clientName) {
    warnings.push(`“${clientName}” is not one of your clients yet — choose one, or add them first.`)
  }

  const summary =
    collapse(parts.summary, 240) ||
    (items.length === 1 ? 'Added one line item.' : `Added ${items.length} line items.`)

  return {
    clientId,
    clientName,
    clientMatch,
    items,
    currency,
    taxRate,
    discountType,
    discountValue,
    dueInDays,
    notes: parts.notes,
    summary,
    warnings,
    source,
  }
}

/**
 * Reads the model's JSON defensively.
 *
 * `strict: true` guarantees the keys are present and the types are right; it
 * guarantees nothing about the values, and a rejected payload must not become a
 * 500. Anything unreadable comes back as null and the rules parser takes over.
 */
function partsFromModel(raw: unknown): DraftParts | null {
  if (typeof raw !== 'object' || raw === null) return null
  const model = raw as ModelDraft
  if (!Array.isArray(model.items)) return null

  const items = (model.items as unknown[])
    .filter((item): item is ModelItem => typeof item === 'object' && item !== null)
    .map((item) => ({
      description: collapse(item.description, 200),
      detail: collapse(item.detail, 300),
      quantity: collapse(item.quantity, 24),
      rate: collapse(item.rate, 24),
    }))

  return {
    clientName: textOrNull(model.clientName, 120),
    currency: textOrNull(model.currency, 8),
    taxRatePercent: textOrNull(model.taxRatePercent, 16),
    discountType: model.discountType === 'percentage' || model.discountType === 'fixed' ? model.discountType : null,
    discountValue: textOrNull(model.discountValue, 24),
    dueInDays: typeof model.dueInDays === 'number' && Number.isFinite(model.dueInDays) ? model.dueInDays : null,
    notes: textOrNull(model.notes, 2000),
    summary: collapse(model.summary, 240),
    items,
  }
}

/* -------------------------------------------------------------------------- */
/* The local parser — no key, no network, still useful                         */
/* -------------------------------------------------------------------------- */

const CURRENCY = '₹|\\brs\\.?|\\binr\\b|\\$|\\busd\\b|€|\\beur\\b|£|\\bgbp\\b|\\baed\\b'
const SCALE = 'k|thousand|lakhs?|lacs?|l|crores?|cr|million|mn|m'
const NUMBER = '\\d+(?:\\.\\d+)?'

const SCALE_FACTORS: Array<[RegExp, number]> = [
  [/^(?:k|thousand)$/i, 1_000],
  [/^(?:l|lacs?|lakhs?)$/i, 100_000],
  [/^(?:m|mn|million)$/i, 1_000_000],
  [/^(?:cr|crores?)$/i, 10_000_000],
]

/** `"1.2", "lakh"` -> 12_000_000 minor units. Null when it does not read as money. */
function scaledMinor(digits: string, scale?: string): number | null {
  const base = parseDecimalToMinor(digits)
  if (base === null) return null
  const factor = scale ? (SCALE_FACTORS.find(([pattern]) => pattern.test(scale.trim()))?.[1] ?? 1) : 1
  const minor = base * factor
  return Number.isSafeInteger(minor) ? minor : null
}

function detectCurrency(text: string): string | null {
  if (/₹|\brs\.?\b|\binr\b|\brupees?\b/i.test(text)) return 'INR'
  if (/\$|\busd\b|\bdollars?\b/i.test(text)) return 'USD'
  if (/€|\beur\b|\beuros?\b/i.test(text)) return 'EUR'
  if (/£|\bgbp\b|\bpounds?\b/i.test(text)) return 'GBP'
  if (/\baed\b|\bdirhams?\b/i.test(text)) return 'AED'
  return null
}

/**
 * Finds the first match of each pattern, hands it to `take`, and cuts the
 * matched span out of the text when `take` used it.
 *
 * Cutting is the point: a tax rate that stays in the string gets read again as a
 * line item, and "due in 14 days" becomes a quantity of 14.
 */
function extract(text: string, patterns: RegExp[], take: (match: RegExpMatchArray) => boolean): string {
  let out = text
  for (const pattern of patterns) {
    const match = out.match(pattern)
    if (!match || match.index === undefined || !take(match)) continue
    out = `${out.slice(0, match.index)} ${out.slice(match.index + match[0].length)}`
  }
  return out
}

const TAX_WORDS = 'gst|igst|cgst|sgst|vat|sales\\s*tax|service\\s*tax|tax'

const DISCOUNT_PERCENT_PATTERNS = [
  new RegExp(`(${NUMBER})\\s*%\\s*(?:discount|off|less|rebate)\\b`, 'i'),
  new RegExp(`\\b(?:discount|off|less|rebate)\\s*(?:of|at|@|=)?\\s*(${NUMBER})\\s*%`, 'i'),
]

const DISCOUNT_FIXED_PATTERNS = [
  new RegExp(`\\b(?:discount|less|rebate|minus)\\s*(?:of|at|@|=)?\\s*(?:${CURRENCY})?\\s*(${NUMBER})(?:\\s*(${SCALE})\\b)?`, 'i'),
  new RegExp(`(?:${CURRENCY})?\\s*(${NUMBER})(?:\\s*(${SCALE})\\b)?\\s*(?:discount|off|less)\\b`, 'i'),
]

const TAX_PATTERNS = [
  new RegExp(`(${NUMBER})\\s*%\\s*(?:${TAX_WORDS})\\b`, 'i'),
  new RegExp(`\\b(?:${TAX_WORDS})\\s*(?:@|of|at|is|=)?\\s*(${NUMBER})\\s*%`, 'i'),
  new RegExp(`\\b(?:plus|with|add|including|incl\\.?|and)\\s*(${NUMBER})\\s*%`, 'i'),
]

const DUE_PATTERNS = [
  /\bnet\s*(\d{1,3})\b/i,
  /\b(?:due|payable|payment|terms?)\s*(?:date)?\s*(?:in|after|within|is|of|:|=)?\s*(\d{1,3})\s*(day|days|week|weeks|month|months)\b/i,
  /\b(?:in|within|after)\s*(\d{1,3})\s*(day|days|week|weeks|month|months)\b/i,
  /\b(\d{1,3})\s*(day|days|week|weeks|month|months)\s*(?:terms?|to\s+pay)\b/i,
]

const DUE_UNITS: Array<[RegExp, number]> = [
  [/^d/i, 1],
  [/^w/i, 7],
  [/^m/i, 30],
]

/** Words that are glue, not work. A segment made only of these is dropped. */
const NOISE = /^(?:with|and|also|plus|add(?:ed)?|apply|applied|make\s*it|including|incl\.?|please|then|thanks|thank\s*you|for|to|invoice|bill)?$/i

/** Filler at either end of a description, once the numbers have been cut out. */
const EDGE_WORDS =
  'for|at|of|a|an|the|and|plus|with|add|also|is|are|to|on|in|each|per|apiece|x|×|hrs?|hours?|units?|nos?|pcs?|pieces?|charge[sd]?|charged|bill(?:ed)?|cost(?:s|ing)?|price[sd]?|worth|about|around|approx\\.?'

const LEADING_FILLER = new RegExp(`^(?:[\\s,;:.\\-–—*•]|\\b(?:${EDGE_WORDS})\\b)+`, 'i')
const TRAILING_FILLER = new RegExp(`(?:[\\s,;:.\\-–—*•]|\\b(?:${EDGE_WORDS})\\b)+$`, 'i')

function trimFiller(value: string): string {
  let out = value
  for (let pass = 0; pass < 6; pass += 1) {
    const next = out.replace(LEADING_FILLER, '').replace(TRAILING_FILLER, '')
    if (next === out) break
    out = next
  }
  return out.replace(/\s+/g, ' ').trim()
}

const QTY_TIMES_RATE = new RegExp(`(${NUMBER})\\s*(?:x|×|\\*)\\s*(?:${CURRENCY})?\\s*(${NUMBER})(?:\\s*(${SCALE})\\b)?`, 'i')

const UNITS = 'hrs?|hours?|days?|units?|pcs?|pieces?|items?|pages?|posts?|sessions?|months?|words?|licen[cs]es?|seats?'
const QTY_UNIT_AT_RATE = new RegExp(
  `(${NUMBER})\\s*(?:${UNITS})\\b([^\\d]*?)(?:@|\\bat\\b|\\bfor\\b)\\s*(?:${CURRENCY})?\\s*(${NUMBER})(?:\\s*(${SCALE})\\b)?`,
  'i',
)
const ANY_AMOUNT = new RegExp(`(?:${CURRENCY})?\\s*(${NUMBER})(?:\\s*(${SCALE})\\b)?`, 'gi')

function cutSpan(text: string, index: number, length: number, keep = ''): string {
  return `${text.slice(0, index)} ${keep} ${text.slice(index + length)}`
}

/**
 * The last thing in the segment that reads like money.
 *
 * A bare one- or two-digit number is not money — it is "Logo v2" or "Phase 3" —
 * so an amount has to be recognisable: a currency mark, a scale word, a decimal,
 * or three digits. Guessing wrong here puts a wrong price on an invoice, which is
 * far worse than leaving the rate blank and saying so.
 */
function amountIn(segment: string): { minor: number; index: number; length: number } | null {
  let found: { minor: number; index: number; length: number } | null = null
  for (const match of segment.matchAll(ANY_AMOUNT)) {
    const [span, digits, scale] = match
    if (match.index === undefined || !digits) continue
    const marked = /[₹$€£]|\brs\.?|\binr\b|\busd\b|\beur\b|\bgbp\b|\baed\b/i.test(span)
    if (!marked && !scale && !digits.includes('.') && Number(digits) < 100) continue
    const minor = scaledMinor(digits, scale)
    if (minor === null || minor <= 0) continue
    found = { minor, index: match.index, length: span.length }
  }
  return found
}

function pairedInSegment(segment: string): { quantity: string; rate: number; rest: string } | null {
  const times = segment.match(QTY_TIMES_RATE)
  if (times?.index !== undefined) {
    const rate = scaledMinor(times[2]!, times[3])
    if (rate !== null && rate > 0) return { quantity: times[1]!, rate, rest: cutSpan(segment, times.index, times[0].length) }
  }

  const unit = segment.match(QTY_UNIT_AT_RATE)
  if (unit?.index !== undefined) {
    const rate = scaledMinor(unit[3]!, unit[4])
    // The words between the quantity and the price are the description — "6
    // hours of design QA at 1500" must not lose "of design QA" with the span.
    if (rate !== null && rate > 0) return { quantity: unit[1]!, rate, rest: cutSpan(segment, unit.index, unit[0].length, unit[2]) }
  }

  return null
}

function itemFromSegment(raw: string): DraftParts['items'][number] | null {
  const segment = raw.replace(/^[\s\-*•]+/, '').trim()
  if (!segment || NOISE.test(segment)) return null

  const paired = pairedInSegment(segment)
  if (paired) {
    return {
      description: capitalise(trimFiller(paired.rest)),
      detail: '',
      quantity: paired.quantity,
      rate: minorToInput(paired.rate),
    }
  }

  const amount = amountIn(segment)
  const remainder = amount ? cutSpan(segment, amount.index, amount.length) : segment
  const description = capitalise(trimFiller(remainder))
  if (!description && !amount) return null

  return { description, detail: '', quantity: '1', rate: amount ? minorToInput(amount.minor) : '' }
}

/**
 * Pulls a client out of the note and removes the words that named them.
 *
 * The user's own client names are tried first and longest-first, so "Acme
 * Technologies" is not shortened to "Acme". Failing that, a run of capitalised
 * words after "for" or "to" is a good guess at a name the account does not have
 * yet — and if that misses too, nothing is claimed.
 */
function clientInText(text: string, clients: readonly DraftClient[]): { name: string | null; rest: string } {
  const names = clients
    .flatMap((client) => [client.name, client.company])
    .filter((name): name is string => Boolean(name && name.trim().length >= 3))
    .sort((a, b) => b.length - a.length)

  for (const name of names) {
    const pattern = new RegExp(`(?:\\b(?:for|to|client)\\s+)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    const match = text.match(pattern)
    if (match?.index !== undefined) return { name, rest: cutSpan(text, match.index, match[0].length) }
  }

  const guess = text.match(/\b(?:for|to|client)\s+((?:[A-Z][\w&.'-]*)(?:\s+(?:[A-Z][\w&.'-]*|of|and|&)){0,3})/)
  if (guess?.index !== undefined && guess[1]) {
    return { name: guess[1].trim(), rest: cutSpan(text, guess.index, guess[0].length) }
  }

  return { name: null, rest: text }
}

/** "create an invoice for" adds nothing to a line item. */
const PREAMBLE =
  /^\s*(?:hi|hey|hello)?[\s,]*(?:can you|could you|please)?\s*(?:create|make|draft|generate|raise|prepare|add|new)?\s*(?:an?|the)?\s*(?:invoice|bill)\b\s*(?:for|to)?\s*/i

const SEGMENTS = /\s*(?:\r?\n|[;•·]|,|\band\b|\bplus\b|\+|\s&\s)\s*/

function partsFromRules(text: string, context: DraftContext): DraftParts {
  // Digit-group commas go first, so "25,000" survives a comma-separated split.
  let working = text.replace(/(\d)[,](?=\d\d)/g, '$1')

  const currency = detectCurrency(working)

  let discountType: DraftParts['discountType'] = null
  let discountValue: string | null = null
  working = extract(working, DISCOUNT_PERCENT_PATTERNS, (match) => {
    if (discountType !== null || !match[1]) return false
    discountType = 'percentage'
    discountValue = match[1]
    return true
  })
  working = extract(working, DISCOUNT_FIXED_PATTERNS, (match) => {
    if (discountType !== null || !match[1]) return false
    const minor = scaledMinor(match[1], match[2])
    if (minor === null || minor <= 0) return false
    discountType = 'fixed'
    discountValue = minorToInput(minor)
    return true
  })

  let taxRatePercent: string | null = null
  working = extract(working, TAX_PATTERNS, (match) => {
    if (taxRatePercent !== null || !match[1]) return false
    taxRatePercent = match[1]
    return true
  })

  let dueInDays: number | null = null
  working = extract(working, DUE_PATTERNS, (match) => {
    if (dueInDays !== null || !match[1]) return false
    const unit = match[2] ? (DUE_UNITS.find(([pattern]) => pattern.test(match[2]!))?.[1] ?? 1) : 1
    dueInDays = Number(match[1]) * unit
    return true
  })

  const client = clientInText(working, context.clients)
  working = client.rest.replace(PREAMBLE, ' ')

  const items = working.split(SEGMENTS).map(itemFromSegment).filter((item): item is DraftParts['items'][number] => item !== null)

  // A note that prices some lines and not others usually means the unpriced
  // fragment was context ("for Acme", "thanks!") rather than work. Once anything
  // has a price, priceless leftovers are dropped instead of shown as blank rows.
  const priced = items.filter((item) => item.rate !== '')

  return {
    clientName: client.name,
    currency,
    taxRatePercent,
    discountType,
    discountValue,
    dueInDays,
    notes: null,
    summary: '',
    items: priced.length > 0 ? priced : items,
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/** The no-network path, exported so it can be tested on its own. */
export function draftFromRules(text: string, context: DraftContext): InvoiceDraft {
  return assemble(partsFromRules(text, context), context, 'rules')
}

/**
 * Builds a draft from a note, preferring the model.
 *
 * The fallback ladder is deliberate. A missing or rejected key, or a model that
 * declines the text, drops to the local parser — a weaker answer beats a dead
 * button. A timeout or a rate limit is *not* absorbed: it throws, so the caller
 * can say "try again" and mean it. And if neither path finds a single line item,
 * that is the one case worth refusing, because there is nothing to apply.
 */
export async function buildInvoiceDraft(text: string, context: DraftContext): Promise<InvoiceDraft> {
  if (hasAiProvider()) {
    try {
      const raw = await groqChatJson({
        system: systemPrompt(context),
        user: text,
        schema: DRAFT_SCHEMA,
        schemaName: 'invoice_draft',
      })
      const parts = partsFromModel(raw)
      if (parts) {
        const draft = assemble(parts, context, 'model')
        if (draft.items.length > 0) return draft
      }
    } catch (error) {
      if (!(error instanceof AiUnavailableError) && !(error instanceof AiUnreadableError)) throw error
    }
  }

  const draft = draftFromRules(text, context)
  if (draft.items.length === 0) {
    throw new AiUnreadableError(
      'That did not read as invoice work. Try something like “website redesign 25,000 with 18% GST, net 14”.',
    )
  }
  return draft
}
