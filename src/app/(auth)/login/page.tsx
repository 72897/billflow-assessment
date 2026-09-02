import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Sign in',
  description: 'Sign in to BillFlow to manage your invoices, clients and payments.',
}

/**
 * `redirectTo` arrives from the middleware, which means it arrives from the URL
 * — so it is checked here as well as in the login schema. A path that does not
 * start with a single `/` is dropped rather than followed: an attacker who can
 * choose the post-login destination has an open redirect.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; demo?: string }>
}) {
  const params = await searchParams
  const requested = params.redirectTo
  const redirectTo =
    typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') ? requested : undefined

  return <LoginForm redirectTo={redirectTo} demo={params.demo === '1'} />
}
