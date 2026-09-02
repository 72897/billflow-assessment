import Link from 'next/link'
import { Logo } from '@/components/shell/logo'
import { Button } from '@/components/ui/button'

/**
 * Sign in and sign up share this frame. The form sits high on a phone rather
 * than vertically centred, because a centred card jumps when the on-screen
 * keyboard opens and shrinks the viewport.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <Logo href="/" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Back to home</Link>
        </Button>
      </header>

      <main className="flex flex-1 justify-center px-4 pb-16 pt-4 sm:items-center sm:pb-24 sm:pt-0">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  )
}
