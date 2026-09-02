'use client'

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import { Toaster as Sonner, toast } from 'sonner'

/**
 * One toaster for the whole app, mounted in the root layout.
 *
 * Toasts confirm things that already happened ("Invoice sent to …") and report
 * failures that do not belong to a single field. Anything a form can point at
 * stays on the form - a toast that scrolls away is the wrong place for a
 * validation message.
 */
function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={16}
      gap={10}
      duration={4200}
      icons={{
        success: <CheckCircle2 className="size-4 text-success" />,
        error: <XCircle className="size-4 text-danger" />,
        warning: <AlertTriangle className="size-4 text-warning" />,
        info: <Info className="size-4 text-primary" />,
        loading: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-sm text-foreground shadow-pop',
          title: 'font-medium leading-snug',
          description: 'mt-0.5 text-[13px] leading-relaxed text-muted-foreground',
          actionButton:
            'ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover',
          cancelButton: 'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted',
          closeButton: 'border-border bg-card text-muted-foreground',
        },
      }}
      className="sm:!bottom-auto"
    />
  )
}

export { Toaster, toast }
