import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** `2026-09-16` -> `16 Sep 2026`. Renders the calendar date, never shifted by timezone. */
export function formatDate(iso: string | null | undefined, style: 'short' | 'long' | 'numeric' = 'short'): string {
  if (!iso) return '—'
  const datePart = iso.slice(0, 10)
  const [year, month, day] = datePart.split('-').map(Number)
  if (!year || !month || !day) return '—'
  const date = new Date(Date.UTC(year, month - 1, day))
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : style === 'numeric'
        ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }
        : { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }
  return new Intl.DateTimeFormat('en-GB', options).format(date)
}

/** `2026-09-02T10:24:00Z` -> `02 Sep 2026, 10:24 AM` in the viewer's timezone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(' at ', ', ')
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
}

/** "3 minutes ago", "yesterday", "2 Sep". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(new Date(then).toISOString())
}

/** `YYYY-MM-DD` for an `<input type="date">`, in local calendar terms. */
export function toDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysToIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** "Kunal Singh" -> "KS"; "acme" -> "AC". */
export function initials(name: string | null | undefined, fallback = '?'): string {
  const clean = (name ?? '').trim()
  if (!clean) return fallback
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

/** Deterministic avatar tint, so a given client always looks the same. */
const AVATAR_TINTS = [
  'bg-blue-50 text-blue-700 ring-blue-100',
  'bg-violet-50 text-violet-700 ring-violet-100',
  'bg-emerald-50 text-emerald-700 ring-emerald-100',
  'bg-amber-50 text-amber-700 ring-amber-100',
  'bg-rose-50 text-rose-700 ring-rose-100',
  'bg-cyan-50 text-cyan-700 ring-cyan-100',
  'bg-indigo-50 text-indigo-700 ring-indigo-100',
]

export function avatarTint(seed: string | null | undefined): string {
  const value = seed ?? ''
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100_000
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Greeting for the dashboard header. */
export function greeting(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Builds a query string, skipping empty values, for URL-synced filters. */
export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === 'all') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
