'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  value: string
  label?: string
  copiedLabel?: string
  /** Icon only, for tight rows. */
  iconOnly?: boolean
  toastMessage?: string
}

/**
 * Copies to the clipboard and says so on the button itself for two seconds.
 *
 * `navigator.clipboard` needs a secure context, so it is not always there - on
 * plain HTTP the fallback selects a hidden textarea and runs `execCommand`,
 * which is deprecated but works, and failing that the user is told to copy
 * manually rather than left wondering whether the click registered.
 */
function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  iconOnly = false,
  toastMessage,
  variant = 'secondary',
  size = 'sm',
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    const ok = await writeToClipboard(value)
    if (!ok) {
      toast.error('Could not copy automatically', { description: 'Select the link and copy it by hand.' })
      return
    }
    setCopied(true)
    if (toastMessage) toast.success(toastMessage)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon') : size}
      onClick={copy}
      className={cn(copied && 'text-success', className)}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
      {...props}
    >
      {copied ? <Check /> : <Copy />}
      {iconOnly ? null : copied ? copiedLabel : label}
    </Button>
  )
}

async function writeToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export { CopyButton }
