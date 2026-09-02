import { AppError } from '@/lib/errors'
import { AiTransientError, AiUnavailableError, AiUnreadableError } from './groq'

/**
 * Turns an AI failure into the status the browser should actually see.
 *
 * The three cases read differently to a user, so they must not collapse into one
 * 500: "that text did not describe any work" is something they can fix, "the
 * service is busy" is worth a retry button, and "this deployment has no key" is
 * neither — it is a fact about the server, and the message says so rather than
 * blaming the input.
 */
export function aiAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (error instanceof AiUnreadableError) {
    return new AppError(error.message, { status: 422, code: 'ai_unreadable', cause: error })
  }
  if (error instanceof AiTransientError) {
    return new AppError(error.message, { status: 503, code: 'ai_unavailable', cause: error })
  }
  if (error instanceof AiUnavailableError) {
    return new AppError('The AI assistant is not set up on this deployment. Add a GROQ_API_KEY to turn it on.', {
      status: 503,
      code: 'ai_not_configured',
      cause: error,
    })
  }

  return new AppError('The AI assistant could not answer. Please try again.', {
    status: 502,
    code: 'ai_failed',
    cause: error,
  })
}
