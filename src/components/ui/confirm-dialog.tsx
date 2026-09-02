'use client'

import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormError } from '@/components/ui/error-state'
import { errorMessage } from '@/lib/api/client'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** Extra detail — what will be kept, what will be lost. */
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  /** Resolved: the dialog closes. Rejected: the reason is shown inside it. */
  onConfirm: () => Promise<unknown> | unknown
}

/**
 * The dialog behind every destructive action.
 *
 * Failure is reported inside the dialog rather than as a toast after it closes,
 * because "delete" that quietly did not delete is the worst outcome here — the
 * dialog stays open with the reason until the user acknowledges it.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {tone === 'danger' ? (
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger">
                <AlertTriangle className="size-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription className="mt-1">{description}</DialogDescription> : null}
            </div>
          </div>
        </DialogHeader>

        {children || error ? (
          <DialogBody className="space-y-3">
            {children}
            <FormError message={error} />
          </DialogBody>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
