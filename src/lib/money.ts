/**
 * Money handling.
 *
 * Every amount is carried through the application as an **integer number of
 * minor units** (paise, cents). Nothing is ever multiplied or added as a
 * floating-point rupee value, so 0.1 + 0.2 problems cannot reach a total.
 *
 * The database stores `numeric(14,2)`; `toDecimal()` / `fromDecimal()` convert
 * at the boundary. Reads always cast to text in SQL so both drivers hand back
 * an exact decimal string rather than a lossy double.
 */

export const SUPPORTED_CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee', locale: 'en-IN' },
  { code: 'USD', symbol: '$', label: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', symbol: '€', label: 'Euro', locale: 'en-IE' },
  { code: 'GBP', symbol: '£', label: 'British Pound', locale: 'en-GB' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', locale: 'en-SG' },
  { code: 'AED', symbol: 'AED', label: 'UAE Dirham', locale: 'en-AE' },
] as const

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code']

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as readonly CurrencyCode[]

export const DEFAULT_CURRENCY: CurrencyCode = 'INR'

/** All supported currencies use two decimal places. */
export const MINOR_UNITS_PER_UNIT = 100

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCY_CODES as readonly string[]).includes(value)
}

export function currencyMeta(code: string) {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? SUPPORTED_CURRENCIES[0]
}

export function currencySymbol(code: string): string {
  return currencyMeta(code).symbol
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a user- or database-supplied decimal into integer minor units.
 *
 * Accepts `"1,234.5"`, `"₹ 1234.50"`, `1234.5`, `".5"`. Returns `null` for
 * anything that is not a finite decimal number, so callers can surface a
 * validation error rather than silently storing NaN.
 */
export function parseDecimalToMinor(input: unknown, scale = 2): number | null {
  if (input === null || input === undefined || input === '') return null

  let raw: string
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    // toFixed with extra precision then trim, to avoid 0.1*3 style artefacts.
    raw = input.toFixed(Math.max(scale + 4, 6))
  } else if (typeof input === 'string') {
    raw = input
  } else {
    return null
  }

  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(/,/g, '')
    .replace(/^[^\d.+-]+/, '') // leading currency symbol
    .trim()

  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null

  const negative = cleaned.startsWith('-')
  const unsigned = cleaned.replace(/^[+-]/, '')
  const [whole = '0', fractionRaw = ''] = unsigned.split('.')

  // Round half-up on the first dropped digit instead of truncating.
  const kept = fractionRaw.slice(0, scale).padEnd(scale, '0')
  const nextDigit = fractionRaw.charAt(scale)
  let minor = Number(whole) * 10 ** scale + Number(kept || '0')
  if (nextDigit && Number(nextDigit) >= 5) minor += 1

  if (!Number.isSafeInteger(minor)) return null
  return negative ? -minor : minor
}

/** Database `numeric` string -> integer minor units. Throws on malformed input. */
export function fromDecimal(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const minor = parseDecimalToMinor(value, 2)
  if (minor === null) {
    throw new Error(`Cannot read "${String(value)}" as a monetary amount`)
  }
  return minor
}

/** Integer minor units -> the `numeric(14,2)` string the database expects. */
export function toDecimal(minor: number): string {
  const rounded = Math.round(minor)
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  const whole = Math.floor(abs / MINOR_UNITS_PER_UNIT)
  const fraction = abs % MINOR_UNITS_PER_UNIT
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`
}

/** Quantity is `numeric(12,3)`; carry it as integer thousandths. */
export function parseQuantityToThousandths(input: unknown): number | null {
  return parseDecimalToMinor(input, 3)
}

export function quantityToDecimal(thousandths: number): string {
  const sign = thousandths < 0 ? '-' : ''
  const abs = Math.abs(Math.round(thousandths))
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`
}

/** Renders a quantity without trailing zero noise: 1, 1.5, 0.25. */
export function formatQuantity(thousandths: number): string {
  const value = thousandths / 1000
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

/** Percentages are `numeric(5,2)`; carry them as integer basis points. */
export function parseRateToBasisPoints(input: unknown): number | null {
  return parseDecimalToMinor(input, 2)
}

export function rateToDecimal(basisPoints: number): string {
  return toDecimal(basisPoints)
}

/** Renders a rate the way an invoice reads it: 18, 18.5, 0. */
export function formatRate(basisPoints: number): string {
  const value = basisPoints / 100
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.NumberFormat>()

function numberFormatter(locale: string, minimumFractionDigits: number, maximumFractionDigits: number) {
  const key = `${locale}:${minimumFractionDigits}:${maximumFractionDigits}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: true,
    })
    formatterCache.set(key, formatter)
  }
  return formatter
}

/**
 * `6490000, 'INR'` -> `"64,900"`. Digit grouping follows the currency's locale,
 * so INR gets the Indian lakh/crore grouping (`1,84,500`).
 *
 * Decimals appear only when the amount actually has them, which is what the
 * reference design shows and what an invoice reads best as.
 */
export function formatAmount(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const meta = currencyMeta(currency)
  const hasFraction = Math.abs(Math.round(minor)) % MINOR_UNITS_PER_UNIT !== 0
  const digits = hasFraction ? 2 : 0
  return numberFormatter(meta.locale, digits, digits).format(Math.round(minor) / MINOR_UNITS_PER_UNIT)
}

/** `6490000, 'INR'` -> `"INR 64,900"` — the primary money style in the UI. */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  return `${currencyMeta(currency).code} ${formatAmount(minor, currency)}`
}

/** `6490000, 'INR'` -> `"₹64,900"` — for tight spots such as chart axes. */
export function formatMoneySymbol(minor: number, currency: string = DEFAULT_CURRENCY): string {
  return `${currencySymbol(currency)}${formatAmount(minor, currency)}`
}

/** Always two decimals — used on the PDF, where columns must line up. */
export function formatAmountExact(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const meta = currencyMeta(currency)
  return numberFormatter(meta.locale, 2, 2).format(Math.round(minor) / MINOR_UNITS_PER_UNIT)
}

/** Compact axis labels: 0, 40K, 1.2M. */
export function formatCompactAmount(minor: number): string {
  const units = Math.round(minor) / MINOR_UNITS_PER_UNIT
  const abs = Math.abs(units)
  if (abs >= 10_000_000) return `${trimZero(units / 10_000_000)}Cr`
  if (abs >= 100_000) return `${trimZero(units / 100_000)}L`
  if (abs >= 1_000) return `${trimZero(units / 1_000)}K`
  return trimZero(units)
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Words for a receipt: "Sixty four thousand nine hundred rupees only". */
export function sumInWords(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const units = Math.floor(Math.abs(Math.round(minor)) / MINOR_UNITS_PER_UNIT)
  const fraction = Math.abs(Math.round(minor)) % MINOR_UNITS_PER_UNIT
  const names: Record<string, [string, string]> = {
    INR: ['rupee', 'paise'],
    USD: ['dollar', 'cents'],
    EUR: ['euro', 'cents'],
    GBP: ['pound', 'pence'],
    AUD: ['dollar', 'cents'],
    CAD: ['dollar', 'cents'],
    SGD: ['dollar', 'cents'],
    AED: ['dirham', 'fils'],
  }
  const [major, minorName] = names[currency] ?? ['unit', 'subunit']
  const useIndianScale = currency === 'INR'
  const head = numberToWords(units, useIndianScale)
  const tail = fraction > 0 ? ` and ${numberToWords(fraction, useIndianScale)} ${minorName}` : ''
  const majorPlural = units === 1 ? major : `${major}s`
  return capitalise(`${head} ${majorPlural}${tail} only`)
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function numberToWords(value: number, indianScale: boolean): string {
  if (value === 0) return 'zero'
  const groups: Array<[number, string]> = indianScale
    ? [
        [10_000_000, 'crore'],
        [100_000, 'lakh'],
        [1_000, 'thousand'],
        [100, 'hundred'],
      ]
    : [
        [1_000_000_000, 'billion'],
        [1_000_000, 'million'],
        [1_000, 'thousand'],
        [100, 'hundred'],
      ]

  const parts: string[] = []
  let remainder = value
  for (const [size, name] of groups) {
    if (remainder >= size) {
      const count = Math.floor(remainder / size)
      parts.push(`${numberToWords(count, indianScale)} ${name}`)
      remainder %= size
    }
  }
  if (remainder > 0) {
    if (remainder < 20) parts.push(ONES[remainder])
    else {
      const tens = TENS[Math.floor(remainder / 10)]
      const ones = remainder % 10
      parts.push(ones ? `${tens}-${ONES[ones]}` : tens)
    }
  }
  return parts.join(' ')
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
