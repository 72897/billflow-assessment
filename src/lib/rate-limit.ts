import { RateLimitError } from '@/lib/errors'

/**
 * Fixed-window rate limiting for the endpoints that send email, take payments
 * or check credentials.
 *
 * Deliberately in-process: it needs no extra infrastructure and it stops the
 * accidental abuse this product actually sees (a double-clicked Pay button, a
 * script hammering /login). It is per-instance, so a horizontally scaled
 * deployment should put a shared store (Redis / Upstash) behind the same
 * interface - the call sites would not change.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitOptions {
  /** Distinct bucket, e.g. `login:ip:1.2.3.4`. */
  key: string
  limit: number
  windowSeconds: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 }
}

/** Same as `checkRateLimit`, but throws the 429 for you. */
export function enforceRateLimit(options: RateLimitOptions, message?: string): void {
  const result = checkRateLimit(options)
  if (!result.ok) {
    throw new RateLimitError(
      message ?? `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
      result.retryAfterSeconds,
    )
  }
}

/** Best-effort client IP from the usual proxy headers. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? 'unknown'
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear()
  lastSweep = 0
}
