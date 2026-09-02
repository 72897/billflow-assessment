/**
 * Application errors.
 *
 * Route handlers and server actions throw these; a single translator turns them
 * into an HTTP status plus a JSON body, so no endpoint has to hand-roll error
 * shapes and no internal message leaks to a client by accident.
 */

export type FieldErrors = Record<string, string[]>

export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors?: FieldErrors
  /** Extra safe-to-expose context, e.g. `{ shareUrl }` on a send failure. */
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    options: { status?: number; code?: string; fieldErrors?: FieldErrors; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.status = options.status ?? 400
    this.code = options.code ?? 'bad_request'
    this.fieldErrors = options.fieldErrors
    this.details = options.details
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Please check the highlighted fields.', fieldErrors?: FieldErrors) {
    super(message, { status: 422, code: 'validation_failed', fieldErrors })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super(message, { status: 401, code: 'unauthorized' })
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource.') {
    super(message, { status: 403, code: 'forbidden' })
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'We could not find what you were looking for.') {
    super(message, { status: 404, code: 'not_found' })
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super(message, { status: 409, code: 'conflict', fieldErrors })
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please wait a moment and try again.', retryAfterSeconds = 30) {
    super(message, { status: 429, code: 'rate_limited', details: { retryAfterSeconds } })
  }
}

/** Raised when a request tries to change an invoice its status does not allow. */
export class InvoiceStateError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 409, code: 'invalid_invoice_state', details })
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** A short, user-facing sentence for any thrown value. */
export function toUserMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isAppError(error)) return error.message
  if (error instanceof Error && process.env.NODE_ENV !== 'production') return error.message
  return fallback
}
