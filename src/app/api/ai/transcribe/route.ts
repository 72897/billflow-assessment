import { aiAppError } from '@/lib/ai/errors'
import { groqTranscribe } from '@/lib/ai/groq'
import { jsonOk, route } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { ValidationError } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { listClientOptions } from '@/lib/repositories/clients'
import { MAX_AUDIO_BYTES } from '@/lib/validation/ai'

/** Whisper picks its decoder from the extension, so the container must be named. */
const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
}

/**
 * Dictation for the invoice composer: speech in, text out.
 *
 * Nothing is stored. The recording is streamed straight to transcription and the
 * transcript comes back to the browser, which drops it into the same textarea
 * someone could have typed into - so the voice path is a shortcut to the existing
 * flow rather than a second one to keep working.
 *
 * The audio is capped before it leaves this process: transcription is billed by
 * length, and an unbounded upload on a public-ish endpoint is somebody else's
 * bill to pay.
 */
export const POST = route(async (request) => {
  const user = await requireUser()

  enforceRateLimit(
    { key: `ai-audio:${user.id}`, limit: 20, windowSeconds: 300 },
    'That is a lot of dictation at once. Give it a moment and try again.',
  )

  const form = await request.formData().catch(() => null)
  const audio = form?.get('audio')

  if (!(audio instanceof Blob)) throw new ValidationError('No recording was uploaded.')
  if (audio.size === 0) throw new ValidationError('That recording came through empty. Try again.')
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new ValidationError('That recording is too long. Keep it under about a minute.')
  }

  const type = audio.type.split(';')[0]?.trim().toLowerCase() ?? ''
  const extension = EXTENSIONS[type]
  if (!extension) throw new ValidationError('That audio format is not supported.')

  // The client list is a vocabulary hint, not data the model may return: it makes
  // Whisper spell "Northwind Traders" rather than "north wind traders".
  const clients = await listClientOptions(user.id)
  const names = clients
    .slice(0, 40)
    .map((client) => client.name)
    .join(', ')
  const prompt = names
    ? `An invoice dictated by a freelancer. Amounts, taxes such as GST, and these client names: ${names}.`
    : 'An invoice dictated by a freelancer, with amounts and taxes such as GST.'

  try {
    return jsonOk({ text: await groqTranscribe({ audio, filename: `dictation.${extension}`, prompt }) })
  } catch (error) {
    throw aiAppError(error)
  }
})
