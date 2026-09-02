import { z } from 'zod'
import { requiredText } from './fields'

/**
 * Long enough for a paragraph of "here is what I did this month", short enough
 * that a pasted novel cannot run the token bill up. The composer counts down to
 * it in the UI, so hitting the limit is never a surprise.
 */
export const MAX_NOTE_LENGTH = 1200

export const invoiceDraftSchema = z.object({
  text: requiredText('A description of the work', MAX_NOTE_LENGTH, 3),
})

export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>

/** Whisper is billed by audio length, so the ceiling is on duration and bytes. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024
