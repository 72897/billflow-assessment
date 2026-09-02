'use client'

import { Mic, RotateCcw, Square, TriangleAlert, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { NewClientDialog } from '@/components/clients/new-client-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormError } from '@/components/ui/error-state'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch, errorMessage } from '@/lib/api/client'
import { addDaysToIsoDate } from '@/lib/utils'
import { MAX_NOTE_LENGTH } from '@/lib/validation/ai'
import type { ClientOption, InvoiceFormValues } from './invoice-form-values'

/** Mirrors `InvoiceDraft` on the server, minus the fields the form does not use. */
interface DraftResponse {
  draft: {
    clientId: string | null
    clientName: string | null
    clientMatch: 'exact' | 'partial' | 'unknown' | 'none'
    items: Array<{ description: string; detail: string; quantity: string; rate: string }>
    currency: string | null
    taxRate: string | null
    discountType: 'percentage' | 'fixed' | null
    discountValue: string | null
    dueInDays: number | null
    notes: string | null
    summary: string
    warnings: string[]
    source: 'model' | 'rules'
  }
}

const EXAMPLES = [
  'Website redesign ₹25,000 and SEO setup ₹5,000, 10% discount, 18% GST, due in 14 days',
  'Logo redesign 40k, 6 hours of design QA at 1500, net 30',
  '3 landing pages at 9,000 each with 18% GST',
]

/** A recording longer than this is a monologue, not an invoice. */
const MAX_RECORDING_MS = 60_000

export interface AiComposerProps {
  /**
   * Called with a client this composer created for a name the account did not
   * have. The parent owns the picker's options, so it decides how the new row
   * joins the list and gets selected.
   */
  onClientCreated: (client: ClientOption) => void
}

/**
 * The AI composer: a note in, a filled-in invoice out.
 *
 * It writes into the form it is mounted in rather than posting anything of its
 * own, which is the whole design. The draft lands in the same fields you would
 * have typed into, so it can be corrected before it is saved, and the invoice
 * that eventually gets written goes through the identical validation and the
 * identical server-side totals as one built by hand. Nothing is stored until the
 * usual Save.
 *
 * The one exception is a client the note names that the account does not have.
 * The draft never invents one - `clientId` only ever comes from the user's own
 * list - so an unmatched name is reported back as `unknown`, and this offers to
 * create it. That is a real write, made deliberately by a button press, with the
 * email, phone and address typed by the person who knows them.
 *
 * `form.reset()` rather than a series of `setValue` calls: the line items are a
 * `useFieldArray`, and only a reset re-keys the rows so the new items render.
 * The values it had first are kept, so Undo is exact.
 *
 * Both resets pass `keepFieldsRef`. A plain reset empties the form's field
 * registry; inputs spread from `register()` put themselves back on the next
 * render, but a `Controller` registers once, so anything that writes to the
 * client or currency picker in the same tick as a reset would update the value
 * and notify nobody. Keeping the registry costs nothing and removes the whole
 * question.
 */
function AiComposer({ onClientCreated }: AiComposerProps) {
  const form = useFormContext<InvoiceFormValues>()

  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'draft' | 'audio' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ summary: string; warnings: string[]; source: 'model' | 'rules' } | null>(null)
  const [recording, setRecording] = useState(false)
  const [canRecord, setCanRecord] = useState(false)
  /** The name the note used, when it is nobody on the account yet. */
  const [missingClient, setMissingClient] = useState<string | null>(null)
  const [addingClient, setAddingClient] = useState(false)

  const recorder = useRef<MediaRecorder | null>(null)
  const undoTo = useRef<InvoiceFormValues | null>(null)

  // Checked after mount: `navigator` does not exist while this renders on the
  // server, and a button that appears on hydration is better than one that
  // disagrees with the HTML.
  useEffect(() => {
    setCanRecord(typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined')
    return () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function apply(draft: DraftResponse['draft']) {
    const current = form.getValues()
    undoTo.current = current

    form.reset(
      {
        ...current,
        clientId: draft.clientId ?? current.clientId,
        currency: draft.currency ?? current.currency,
        items: draft.items.length > 0 ? draft.items : current.items,
        taxRate: draft.taxRate ?? current.taxRate,
        discountType: draft.discountType ?? current.discountType,
        discountValue: draft.discountValue ?? current.discountValue,
        notes: draft.notes ?? current.notes,
        dueDate:
          draft.dueInDays !== null && current.issueDate
            ? addDaysToIsoDate(current.issueDate, draft.dueInDays)
            : current.dueDate,
      },
      { keepDefaultValues: true, keepFieldsRef: true },
    )

    const warnings = [...draft.warnings]
    if (draft.clientMatch === 'partial' && draft.clientName) {
      warnings.unshift(`Billed to ${draft.clientName} - change it above if that is the wrong client.`)
    }
    setMissingClient(draft.clientMatch === 'unknown' ? draft.clientName : null)
    setResult({ summary: draft.summary, warnings, source: draft.source })
  }

  function clientCreated(client: ClientOption) {
    onClientCreated(client)
    setMissingClient(null)
    // Undo restores the form as it was, but this client now exists for real -
    // emptying the field it was created for is not what Undo means here.
    if (undoTo.current) undoTo.current = { ...undoTo.current, clientId: client.id }
  }

  function undo() {
    if (!undoTo.current) return
    form.reset(undoTo.current, { keepDefaultValues: true, keepFieldsRef: true })
    undoTo.current = null
    setResult(null)
    setMissingClient(null)
  }

  async function generate(note: string) {
    const trimmed = note.trim()
    if (trimmed.length < 3 || busy !== null) return

    setBusy('draft')
    setError(null)
    setResult(null)
    setMissingClient(null)
    try {
      const { draft } = await apiFetch<DraftResponse>('/api/ai/invoice-draft', {
        method: 'POST',
        body: JSON.stringify({ text: trimmed }),
      })
      apply(draft)
    } catch (caught) {
      setError(errorMessage(caught, 'The assistant could not read that. Try naming the work and the amount.'))
    } finally {
      setBusy(null)
    }
  }

  async function transcribe(audio: Blob) {
    setBusy('audio')
    setError(null)
    try {
      const body = new FormData()
      body.append('audio', audio, 'dictation.webm')
      const { text: spoken } = await apiFetch<{ text: string }>('/api/ai/transcribe', { method: 'POST', body })
      const note = spoken.slice(0, MAX_NOTE_LENGTH)
      setText(note)
      setBusy(null)
      // Straight through to the draft: stopping to admire the transcript is a
      // step nobody wants, and the text is right there to correct if it is wrong.
      await generate(note)
    } catch (caught) {
      setError(errorMessage(caught, 'That recording could not be transcribed.'))
      setBusy(null)
    }
  }

  async function toggleRecording() {
    if (recorder.current) {
      recorder.current.stop()
      return
    }

    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked. Type the description instead.')
      return
    }

    const instance = new MediaRecorder(stream)
    const chunks: Blob[] = []
    let stopTimer: ReturnType<typeof setTimeout> | null = null

    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    instance.onstop = () => {
      if (stopTimer) clearTimeout(stopTimer)
      stream.getTracks().forEach((track) => track.stop())
      recorder.current = null
      setRecording(false)
      const audio = new Blob(chunks, { type: instance.mimeType || 'audio/webm' })
      if (audio.size > 0) void transcribe(audio)
    }

    recorder.current = instance
    setRecording(true)
    instance.start()
    stopTimer = setTimeout(() => instance.state === 'recording' && instance.stop(), MAX_RECORDING_MS)
  }

  const drafting = busy === 'draft'
  const tooShort = text.trim().length < 3

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Describe the work</CardTitle>
        <CardDescription>
          Write it the way you would in an email - or dictate it - and the client, line items, tax, discount and
          due date below fill themselves in. Nothing is saved until you press Save.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="relative">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // ⌘/Ctrl+Enter drafts without reaching for the mouse. A bare Enter
              // stays a newline: this is prose, and the form's Save is elsewhere.
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                void generate(text)
              }
            }}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            disabled={busy !== null || recording}
            aria-label="Describe the invoice in your own words"
            placeholder={
              recording
                ? 'Listening - press Stop when you are done.'
                : 'Website redesign ₹25,000 and SEO setup ₹5,000, 10% discount, 18% GST, due in 14 days'
            }
            className="pr-16"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-2xs tabular-nums text-muted-foreground/70">
            {text.length}/{MAX_NOTE_LENGTH}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void generate(text)}
            disabled={tooShort || recording}
            loading={drafting}
            loadingText="Reading it…"
          >
            Build the invoice
          </Button>

          {canRecord ? (
            <Button
              type="button"
              size="sm"
              variant={recording ? 'danger' : 'secondary'}
              onClick={() => void toggleRecording()}
              disabled={drafting}
              loading={busy === 'audio'}
              loadingText="Transcribing…"
            >
              {recording ? <Square /> : <Mic />}
              {recording ? 'Stop' : 'Dictate'}
            </Button>
          ) : null}

          {recording ? (
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
              Recording - a minute at most
            </span>
          ) : null}

          {result ? (
            <Button type="button" size="sm" variant="ghost" onClick={undo} className="ml-auto">
              <RotateCcw />
              Undo
            </Button>
          ) : null}
        </div>
        {text.length === 0 && !result && !recording ? (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="max-w-full truncate rounded-full border border-border bg-card px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}

        <FormError message={error} />

        {result ? (
          <div className="grid gap-2 rounded-md border border-info-border bg-info-subtle px-3 py-2.5 text-[13px] leading-relaxed animate-fade-in-up">
            <p className="text-foreground">{result.summary}</p>

            {/*
             * The draft cannot select a client it did not find, and it must not
             * invent one - so the offer is here, next to the sentence that says
             * why. Creating them selects them on this invoice.
             */}
            {missingClient ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-warning-border bg-warning-subtle px-2.5 py-2">
                <span className="flex items-start gap-2 text-foreground">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  <span>
                    <strong className="font-semibold">{missingClient}</strong> is not one of your clients yet.
                  </span>
                </span>
                <Button type="button" size="sm" variant="secondary" onClick={() => setAddingClient(true)}>
                  <UserPlus />
                  Add them
                </Button>
              </div>
            ) : null}

            {result.warnings.length > 0 ? (
              <ul className="grid gap-1.5">
                {result.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-2 text-muted-foreground">
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-2xs text-muted-foreground">
              {result.source === 'rules'
                ? 'Read by the built-in parser - no AI key is configured on this deployment. Check the amounts below.'
                : 'Check the lines below, then Save.'}
            </p>
          </div>
        ) : null}
      </CardContent>

      <NewClientDialog
        open={addingClient}
        onOpenChange={setAddingClient}
        defaultName={missingClient ?? ''}
        onCreated={clientCreated}
      />
    </Card>
  )
}

export { AiComposer }
