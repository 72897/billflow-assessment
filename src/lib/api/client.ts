/**
 * The browser's side of the API contract.
 *
 * Every endpoint answers `{ ok: true, data }` or `{ ok: false, error }`, so
 * unwrapping it belongs in one place rather than in thirty components. A failed
 * request throws an `ApiError` carrying the message the server wrote for a
 * person, plus any per-field messages — which means a component can `catch`,
 * hand `fieldErrors` to react-hook-form, and show the rest in a toast without
 * knowing anything about HTTP.
 */

import type { FieldValues, UseFormSetError, Path } from 'react-hook-form'
import type { ApiResponse } from '@/types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fieldErrors?: Record<string, string[]>
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    options: { code?: string; status?: number; fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? 'error'
    this.status = options.status ?? 500
    this.fieldErrors = options.fieldErrors
    this.details = options.details
  }

  /** True when re-submitting the same form could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429 || this.code === 'network_error'
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Calls an endpoint and returns `data`, or throws `ApiError`. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: init.body ? { ...JSON_HEADERS, ...init.headers } : init.headers,
    })
  } catch {
    // A dropped connection is not a server error, and saying so helps: the user
    // can check their network instead of assuming their data was rejected.
    throw new ApiError('You appear to be offline. Check your connection and try again.', {
      code: 'network_error',
      status: 0,
    })
  }

  const text = await response.text()
  let payload: ApiResponse<T> | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as ApiResponse<T>
    } catch {
      payload = null
    }
  }

  if (!payload) {
    if (response.ok) return undefined as T
    throw new ApiError('Something went wrong. Please try again.', {
      code: 'unreadable_response',
      status: response.status,
    })
  }

  if (payload.ok) return payload.data

  throw new ApiError(payload.error.message, {
    code: payload.error.code,
    status: response.status,
    fieldErrors: payload.error.fieldErrors,
    details: payload.error.details,
  })
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, { ...init, method: 'DELETE' }),
}

/**
 * Moves server-side field errors onto the form that produced them.
 *
 * Returns whatever could not be attached to an input, so the caller can put the
 * remainder somewhere visible instead of silently dropping it — a 422 nobody can
 * see is worse than a rejected submit.
 */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  knownFields?: readonly string[],
): string | null {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  }
  if (!error.fieldErrors) return error.message

  let attached = 0
  let firstUnattached: string | null = null

  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const message = messages[0]
    if (!message) continue
    if (field === '_form' || (knownFields && !knownFields.includes(field))) {
      firstUnattached ??= message
      continue
    }
    setError(field as Path<T>, { type: 'server', message })
    attached += 1
  }

  if (attached === 0) return firstUnattached ?? error.message
  return firstUnattached
}

/** A key that is stable for one submit attempt, for idempotent endpoints. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
