import { SignupForm } from '@/components/auth/signup-form'

export const metadata = {
  title: 'Create account',
  description: 'Create a BillFlow account and send your first invoice today.',
}

export default function SignupPage() {
  return <SignupForm />
}
