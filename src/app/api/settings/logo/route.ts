import { jsonOk, parseJson, route } from '@/lib/api/respond'
import { requireUser } from '@/lib/auth'
import { enforceRateLimit } from '@/lib/rate-limit'
import { updateLogoUrl } from '@/lib/repositories/settings'
import { logoUploadSchema } from '@/lib/validation/settings'

/**
 * The logo, stored as a data URL on the settings row.
 *
 * No object store and no third-party credentials: a downscaled logo is a few tens
 * of kilobytes, and keeping it in the row means the value can be frozen into each
 * invoice's `business_snapshot` alongside the address it belongs with. The browser
 * resizes before uploading; the schema's 2 MB ceiling is the server-side backstop
 * for a caller that skips the file picker (SET-03).
 */
export const POST = route(async (request) => {
  const user = await requireUser()
  enforceRateLimit(
    { key: `logo:${user.id}`, limit: 20, windowSeconds: 600 },
    'That is a lot of logo uploads. Please wait a moment.',
  )

  const input = await parseJson(request, logoUploadSchema)
  const settings = await updateLogoUrl(user.id, input.dataUrl)

  return jsonOk({ settings, logoUrl: settings.logoUrl })
})

export const DELETE = route(async () => {
  const user = await requireUser()
  const settings = await updateLogoUrl(user.id, null)

  return jsonOk({ settings, logoUrl: null })
})
