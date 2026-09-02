import { cn, avatarTint, initials } from '@/lib/utils'

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string | null | undefined
  /** Overrides the deterministic tint - used for the signed-in user. */
  tone?: 'auto' | 'primary'
  size?: 'sm' | 'md' | 'lg'
  src?: string | null
}

const SIZES = {
  sm: 'size-7 text-2xs',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
} as const

/**
 * Initials on a tint derived from the name, so the same client is always the
 * same colour and a list is scannable without reading it.
 */
function Avatar({ name, tone = 'auto', size = 'md', src, className, ...props }: AvatarProps) {
  const label = initials(name)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ring-1',
        SIZES[size],
        tone === 'primary' ? 'bg-primary/10 text-primary ring-primary/15' : avatarTint(name),
        className,
      )}
      aria-hidden={!props['aria-label']}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied data URL / remote logo
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        label
      )}
    </span>
  )
}

export { Avatar }
