'use client'

import { ImageUp, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/error-state'
import { toast } from '@/components/ui/toaster'
import { api, errorMessage } from '@/lib/api/client'
import { LOGO_ALLOWED_TYPES, LOGO_MAX_BYTES } from '@/lib/validation/settings'

export interface LogoUploaderProps {
  logoUrl: string | null
  businessName: string
}

/** The longest edge a stored logo keeps. An invoice never prints it larger. */
const MAX_EDGE = 480

/**
 * Downscales a raster image in the browser and returns a data URL.
 *
 * This is why the 2 MB server limit is almost never reached: a phone photo of a
 * logo goes in at 4 MB and comes out at about 30 KB, which is small enough to
 * live on the settings row and be frozen into every invoice snapshot. SVG is
 * passed through untouched - it is already resolution-independent, and putting it
 * through a canvas would rasterise it.
 */
async function shrink(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.readAsDataURL(file)
  })

  if (file.type === 'image/svg+xml') return dataUrl

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('That image could not be read.'))
    element.src = dataUrl
  })

  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  if (scale === 1 && file.size <= 200_000) return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const context = canvas.getContext('2d')
  if (!context) return dataUrl
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  // JPEG in, JPEG out; everything else becomes PNG so transparency survives.
  return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png')
}

/**
 * The logo, with the preview showing the size an invoice actually prints it at.
 *
 * A logo is the one setting where a preview is not decoration: uploading a 3 MB
 * banner and finding out at send time that it dwarfs the invoice number is a bad
 * way to learn. What is on screen here is what the letterhead looks like (SET-03).
 */
function LogoUploader({ logoUrl, businessName }: LogoUploaderProps) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)

    if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      setError('Choose a PNG, JPG, WEBP or SVG image.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That image is very large. Please pick one under 8MB.')
      return
    }

    setBusy('upload')
    try {
      const dataUrl = await shrink(file)
      if (dataUrl.length > LOGO_MAX_BYTES * 1.4) {
        throw new Error('That image is still too large after resizing. Try a smaller one.')
      }
      await api.post<{ logoUrl: string | null }>('/api/settings/logo', { dataUrl, fileName: file.name })
      toast.success('Logo updated', { description: 'It appears on invoices you create from now on.' })
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ''
    }
  }

  async function remove() {
    setBusy('remove')
    setError(null)
    try {
      await api.del('/api/settings/logo')
      toast.success('Logo removed', { description: 'Invoices fall back to your business name.' })
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-3">
      <FormError message={error} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40 p-2">
          {logoUrl ? (
            // A logo is an arbitrary user upload, so `next/image` cannot size it
            // ahead of time - a plain <img> is the honest tool here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${businessName || 'Your business'} logo`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-2xs text-muted-foreground">No logo yet</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={LOGO_ALLOWED_TYPES.join(',')}
            className="hidden"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy === 'upload'}
            onClick={() => input.current?.click()}
          >
            <ImageUp />
            {logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              loading={busy === 'remove'}
              onClick={() => void remove()}
            >
              <Trash2 />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        PNG, JPG, WEBP or SVG. Anything larger than {MAX_EDGE}px is resized in your browser before it is saved, so the
        upload stays small.
      </p>
    </div>
  )
}

export { LogoUploader }
