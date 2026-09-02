import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-6' } as const

function Spinner({ className, size = 'md' }: { className?: string; size?: keyof typeof SIZES }) {
  return <Loader2 className={cn('animate-spin text-muted-foreground', SIZES[size], className)} aria-hidden />
}

/** A centred spinner with a label, for a panel that is fetching. */
function LoadingBlock({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-14', className)} role="status">
      <Spinner size="lg" />
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  )
}

export { LoadingBlock, Spinner }
