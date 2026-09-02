/**
 * The one place a model gets called.
 *
 * Groq speaks the OpenAI wire format, so this is a thin `fetch` wrapper rather
 * than an SDK — two endpoints do not justify a dependency, and a hand-rolled
 * client is the only way to be sure of the timeout and the error classification.
 *
 * Failures are sorted the same way email failures are (see
 * `PermanentEmailRejection`): a refusal that a retry cannot fix is one thing, a
 * bad moment is another, and telling them apart decides whether the caller falls
 * back, apologises, or offers a retry button that will actually work.
 *
 *   - `AiUnavailableError` — no key, a rejected key, a model that is not on the
 *     account. Retrying is pointless; the caller should use its own fallback.
 *   - `AiUnreadableError` — the request got through and the model declined to
 *     produce the structured answer. The input is the problem, not the service.
 *   - `AiTransientError` — timeout, rate limit, 5xx. Retrying is exactly right.
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1'

/**
 * `openai/gpt-oss-120b` is the strongest model on a free Groq key that honours
 * `response_format: json_schema` with `strict: true`, which is what makes the
 * output safe to feed into a form without a parser full of `if` statements.
 */
export const CHAT_MODEL = 'openai/gpt-oss-120b'

/** Turbo is ~4x faster than `whisper-large-v3` and no worse on short dictation. */
export const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo'

const CHAT_TIMEOUT_MS = 20_000
const TRANSCRIBE_TIMEOUT_MS = 30_000

export class AiUnavailableError extends Error {
  readonly name = 'AiUnavailableError'
}

export class AiUnreadableError extends Error {
  readonly name = 'AiUnreadableError'
}

export class AiTransientError extends Error {
  readonly name = 'AiTransientError'
}

export function groqApiKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null
}

/** True when the assistant can call a model rather than fall back to rules. */
export function hasAiProvider(): boolean {
  return groqApiKey() !== null
}

interface GroqErrorBody {
  error?: { message?: string; code?: string; type?: string; failed_generation?: string }
}

/**
 * Maps an HTTP failure onto one of the three error classes.
 *
 * `json_validate_failed` is the interesting one: it is a 400, but it means the
 * model answered in prose instead of the schema — which is what happens when the
 * text is not a description of work at all, or when it is an attempt to talk to
 * the model rather than through it. That is the user's input to fix, so it comes
 * back as "unreadable" and the route turns it into a 422, not a 500.
 */
function classify(status: number, body: GroqErrorBody | null, raw: string): Error {
  const detail = body?.error?.message?.trim() || raw.slice(0, 300) || `HTTP ${status}`
  const code = body?.error?.code ?? ''

  if (code === 'json_validate_failed' || code === 'tool_use_failed') {
    return new AiUnreadableError(detail)
  }
  if (status === 429) {
    return new AiTransientError(`The AI service is rate limited right now: ${detail}`)
  }
  if (status >= 500) {
    return new AiTransientError(`The AI service is having a bad moment: ${detail}`)
  }
  if (status === 401 || status === 403) {
    return new AiUnavailableError(`The AI service rejected the API key: ${detail}`)
  }
  if (status === 404 || code === 'model_not_found' || code === 'model_terms_required') {
    return new AiUnavailableError(`The AI model is not available on this key: ${detail}`)
  }
  if (status === 413) {
    return new AiUnreadableError('That recording is too long. Keep it under a minute.')
  }
  // Any other 4xx is a bug in this client's request, not something the user can
  // retry into working. Treat it as unavailable so the fallback takes over.
  return new AiUnavailableError(detail)
}

/** A network error or an abort, which are always worth retrying. */
function classifyThrow(error: unknown, what: string): Error {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new AiTransientError(`${what} took too long. Please try again.`)
  }
  const message = error instanceof Error ? error.message : String(error)
  return new AiTransientError(`Could not reach the AI service: ${message}`)
}

async function readError(response: Response): Promise<Error> {
  const raw = await response.text().catch(() => '')
  let body: GroqErrorBody | null = null
  if (raw) {
    try {
      body = JSON.parse(raw) as GroqErrorBody
    } catch {
      body = null
    }
  }
  return classify(response.status, body, raw)
}

export interface ChatJsonRequest {
  system: string
  user: string
  /** A JSON Schema object. `strict: true` is applied for you. */
  schema: Record<string, unknown>
  schemaName: string
  maxTokens?: number
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>
}

/**
 * One structured-output chat call. Returns the parsed JSON, unvalidated —
 * callers run it through zod, because `strict: true` guarantees the shape but
 * not that the values inside make sense.
 */
export async function groqChatJson({ system, user, schema, schemaName, maxTokens = 2048 }: ChatJsonRequest): Promise<unknown> {
  const key = groqApiKey()
  if (!key) throw new AiUnavailableError('No GROQ_API_KEY is configured.')

  let response: Response
  try {
    response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      body: JSON.stringify({
        model: CHAT_MODEL,
        // Zero temperature: the same sentence should produce the same invoice
        // twice, or nobody can trust what they are about to send a client.
        temperature: 0,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, strict: true, schema },
        },
      }),
    })
  } catch (error) {
    throw classifyThrow(error, 'The AI request')
  }

  if (!response.ok) throw await readError(response)

  const payload = (await response.json().catch(() => null)) as ChatCompletion | null
  const content = payload?.choices?.[0]?.message?.content
  if (!content) throw new AiTransientError('The AI service returned an empty answer.')

  try {
    return JSON.parse(content)
  } catch {
    // Schema-enforced output that is not JSON means the model was cut off
    // mid-object — a token budget problem, so retrying can genuinely help.
    throw new AiTransientError('The AI answer was cut short. Please try again.')
  }
}

export interface TranscribeRequest {
  audio: Blob
  filename: string
  /** Vocabulary hint — client names and money words, to steer the spelling. */
  prompt?: string
}

interface Transcription {
  text?: string
}

/** Speech to text. Returns the transcript, trimmed. */
export async function groqTranscribe({ audio, filename, prompt }: TranscribeRequest): Promise<string> {
  const key = groqApiKey()
  if (!key) throw new AiUnavailableError('No GROQ_API_KEY is configured.')

  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', TRANSCRIBE_MODEL)
  form.append('response_format', 'json')
  form.append('temperature', '0')
  if (prompt) form.append('prompt', prompt)

  let response: Response
  try {
    response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      body: form,
    })
  } catch (error) {
    throw classifyThrow(error, 'The transcription')
  }

  if (!response.ok) throw await readError(response)

  const payload = (await response.json().catch(() => null)) as Transcription | null
  const text = payload?.text?.trim()
  if (!text) throw new AiUnreadableError('Nothing was said in that recording.')
  return text
}
