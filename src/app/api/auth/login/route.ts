import { headers } from 'next/headers'
import { jsonOk, parseJson, route } from '@/lib/api/respond'
import { createSession, fakeVerifyDelay, verifyPassword } from '@/lib/auth'
import { UnauthorizedError } from '@/lib/errors'
import { clientIpFrom, enforceRateLimit } from '@/lib/rate-limit'
import { findUserByEmail } from '@/lib/repositories/users'
import { loginSchema } from '@/lib/validation/auth'

/**
 * Sign in.
 *
 * Two deliberate details:
 *   - the same message ("Those details do not match an account") answers both a
 *     wrong password and an unknown email, and an unknown email still burns a
 *     bcrypt comparison, so neither the wording nor the timing reveals which
 *     addresses are registered;
 *   - the limiter is keyed on IP *and* on the email, so one attacker cannot lock
 *     a victim out by exhausting the victim's bucket from elsewhere.
 */
export const POST = route(async (request) => {
  const headerList = await headers()
  const ip = clientIpFrom(headerList)
  const input = await parseJson(request, loginSchema)

  enforceRateLimit(
    { key: `login:ip:${ip}`, limit: 20, windowSeconds: 300 },
    'Too many sign-in attempts from this network. Please wait a moment and try again.',
  )
  enforceRateLimit(
    { key: `login:email:${input.email}`, limit: 8, windowSeconds: 300 },
    'Too many sign-in attempts for that account. Please wait a moment and try again.',
  )

  const user = await findUserByEmail(input.email)
  if (!user) {
    await fakeVerifyDelay()
    throw new UnauthorizedError('Those details do not match an account.')
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new UnauthorizedError('Those details do not match an account.')
  }

  await createSession(user.id, headerList.get('user-agent'))

  return jsonOk({
    user: { id: user.id, email: user.email, fullName: user.fullName },
    redirectTo: input.redirectTo ?? '/dashboard',
  })
})
