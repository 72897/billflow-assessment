/**
 * What the browser is told when the assistant cannot answer.
 *
 * These four outcomes are the whole contract: a note the model could not read is
 * the user's to fix (422), a busy service is worth a retry (503), a deployment
 * with no key is a fact about the server, and a key that exists but was refused
 * is a fifth thing that must not be described as the fourth. The last pair is why
 * this file exists - both arrive as `AiUnavailableError`, and the difference is
 * only visible in the environment.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { aiAppError } from '@/lib/ai/errors'
import { AiTransientError, AiUnavailableError, AiUnreadableError } from '@/lib/ai/groq'

const KEY = process.env.GROQ_API_KEY

afterEach(() => {
  if (KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = KEY
})

describe('aiAppError', () => {
  it('hands an unreadable note back as the user’s to fix', () => {
    const error = aiAppError(new AiUnreadableError('That did not read as invoice work.'))

    expect(error.status).toBe(422)
    expect(error.code).toBe('ai_unreadable')
    expect(error.message).toBe('That did not read as invoice work.')
  })

  it('marks a busy service retryable', () => {
    const error = aiAppError(new AiTransientError('The AI service is rate limited right now.'))

    expect(error.status).toBe(503)
    expect(error.code).toBe('ai_unavailable')
  })

  it('asks for a key only when there is no key', () => {
    delete process.env.GROQ_API_KEY

    const error = aiAppError(new AiUnavailableError('No GROQ_API_KEY is configured.'))

    expect(error.status).toBe(503)
    expect(error.code).toBe('ai_not_configured')
    expect(error.message).toContain('GROQ_API_KEY')
  })

  it('passes on the real reason when a key is present but refused', () => {
    process.env.GROQ_API_KEY = 'gsk_test_not_a_real_key'

    const error = aiAppError(new AiUnavailableError('The AI service rejected the API key: Invalid API Key'))

    expect(error.status).toBe(503)
    expect(error.code).toBe('ai_unavailable')
    expect(error.message).toBe('The AI service rejected the API key: Invalid API Key')
    // The one thing it must never say: add a key that is already there.
    expect(error.message).not.toContain('Add a GROQ_API_KEY')
  })

  it('treats a key of only whitespace as no key at all', () => {
    process.env.GROQ_API_KEY = '   '

    const error = aiAppError(new AiUnavailableError('No GROQ_API_KEY is configured.'))

    expect(error.code).toBe('ai_not_configured')
  })

  it('leaves an AppError alone and does not dress up an unknown throw', () => {
    const unknown = aiAppError(new Error('socket hang up'))

    expect(unknown.status).toBe(502)
    expect(unknown.code).toBe('ai_failed')
    expect(unknown.message).toBe('The AI assistant could not answer. Please try again.')
  })
})
