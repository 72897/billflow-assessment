import { headers } from 'next/headers'
import { jsonOk, parseJson, route } from '@/lib/api/respond'
import { createSession } from '@/lib/auth'
import { ConflictError } from '@/lib/errors'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { createUser, emailIsTaken } from '@/lib/repositories/users'
import { signupSchema } from '@/lib/validation/auth'

/**
 * Creates an account and signs the visitor straight in - nobody wants to type
 * their password twice to see an empty dashboard.
 *
 * Rate-limited per IP: signup writes a bcrypt hash and a settings row, so it is
 * the most expensive unauthenticated endpoint in the app.
 */
export const POST = route(async (request) => {
  const headerList = await headers()
  enforceRateLimit(
    { key: `signup:${clientIpFrom(headerList)}`, limit: 10, windowSeconds: 600 },
    'Too many sign-up attempts from this network. Please try again in a few minutes.',
  )

  const input = await parseJson(request, signupSchema)

  if (await emailIsTaken(input.email)) {
    throw new ConflictError('An account with that email already exists.', {
      email: ['An account with that email already exists'],
    })
  }

  const user = await createUser({ email: input.email, password: input.password, fullName: input.fullName })
  await createSession(user.id, headerList.get('user-agent'))

  return jsonOk({ user: { id: user.id, email: user.email, fullName: user.fullName } }, { status: 201 })
})
