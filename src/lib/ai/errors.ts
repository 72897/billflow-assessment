import { AppError } from '@/lib/errors'
import { AiTransientError, AiUnavailableError, AiUnreadableError, hasAiProvider } from './groq'

/**
 * Turns an AI failure into the status the browser should actually see.
 *
 * The cases read differently to a user, so they must not collapse into one 500:
 * "that text did not describe any work" is something they can fix, "the service
 * is busy" is worth a retry button, and "this deployment has no key" is neither -
 * it is a fact about the server, and the message says so rather than blaming the
 * input.
 *
 * That last one is only worth saying when it is true. A rejected key, a model the
 * key cannot reach, and a request this client got wrong all arrive as the same
 * error class as a missing key, and telling somebody to add a `GROQ_API_KEY` they
 * have already set sends them to the wrong dashboard. When a key is present, the
 * provider's own reason is the more useful thing to pass on - it is already
 * written for a person to read.
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
    const configured = hasAiProvider()
    return new AppError(
      configured
        ? error.message
        : 'The AI assistant is not set up on this deployment. Add a GROQ_API_KEY to turn it on.',
      {
        status: 503,
        code: configured ? 'ai_unavailable' : 'ai_not_configured',
        cause: error,
      },
    )
  }

  return new AppError('The AI assistant could not answer. Please try again.', {
    status: 502,
    code: 'ai_failed',
    cause: error,
  })
}
