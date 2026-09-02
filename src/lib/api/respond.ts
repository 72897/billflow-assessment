/**
 * The one place HTTP happens.
 *
 * Route handlers do three things: authenticate, validate, call a repository.
 * They never build a status code or an error body themselves - they throw an
 * `AppError` and this module turns it into JSON. That keeps every endpoint
 * answering the same envelope (`{ ok, data }` / `{ ok, error }`), and means an
 * unexpected exception cannot leak a stack trace or a SQL fragment to a client.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AppError, ValidationError, isAppError } from '@/lib/errors'
import type { FieldErrors } from '@/lib/errors'
import type { ApiResponse } from '@/types'

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init)
}

/**
 * Flattens Zod issues into `{ field: [messages] }`, which is the shape
 * react-hook-form's `setError` consumes. Nested paths are joined with dots
 * (`items.0.rate`) so a line-item error can find its input.
 */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form'
    result[key] = [...(result[key] ?? []), issue.message]
  }
  return result
}

/** Validates, or throws the 422 with per-field messages attached. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const fieldErrors = fieldErrorsFrom(result.error)
    const first = Object.values(fieldErrors)[0]?.[0]
    throw new ValidationError(first ?? 'Please check the highlighted fields.', fieldErrors)
  }
  return result.data
}

/** Reads a JSON body, treating a malformed one as a validation error, not a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text()
    return text ? JSON.parse(text) : {}
  } catch {
    throw new ValidationError('That request body could not be read as JSON.')
  }
}

export async function parseJson<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  return parseOrThrow(schema, await readJson(request))
}

/** `?status=paid&page=2` as a plain object the query schemas can parse. */
export function searchParamsToObject(url: string | URL): Record<string, string> {
  const params = (url instanceof URL ? url : new URL(url)).searchParams
  const result: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    if (value !== '') result[key] = value
  }
  return result
}

/**
 * Turns any thrown value into a response. `AppError`s carry their own status and
 * a message written for a person; anything else becomes a generic 500, logged
 * server-side so the detail is not lost.
 */
export function errorResponse(error: unknown): NextResponse<ApiResponse<never>> {
  if (error instanceof z.ZodError) {
    const fieldErrors = fieldErrorsFrom(error)
    return errorResponse(new ValidationError(Object.values(fieldErrors)[0]?.[0], fieldErrors))
  }

  if (isAppError(error)) {
    const headers = new Headers()
    const retryAfter = error.details?.retryAfterSeconds
    if (error.status === 429 && typeof retryAfter === 'number') {
      headers.set('Retry-After', String(retryAfter))
    }
    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          message: error.message,
          code: error.code,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status, headers },
    )
  }

  console.error('[api] unhandled error:', error)
  return NextResponse.json<ApiResponse<never>>(
    {
      ok: false,
      error: {
        message: 'Something went wrong on our end. Please try again.',
        code: 'internal_error',
      },
    },
    { status: 500 },
  )
}

/**
 * Wraps a handler so every throw becomes a response. Used as
 * `export const POST = route(async (request) => { ... })`.
 */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<NextResponse | Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    try {
      return await handler(request, ...args)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/** Next 15 hands dynamic segments to a route as a promise. */
export type RouteContext<T extends Record<string, string>> = { params: Promise<T> }

export { AppError }
