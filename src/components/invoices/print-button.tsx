'use client'

import { Printer } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'

export interface PrintButtonProps extends Omit<ButtonProps, 'onClick' | 'asChild'> {
  label?: string
}

/**
 * Opens the browser's print dialog.
 *
 * The real download is the server-rendered PDF; this is the "print it, or save it
 * yourself" escape hatch. It works because the print rules in `globals.css` hide
 * the app chrome and lay the document out on A4, so what comes out of the printer
 * is the invoice rather than a screenshot of the app.
 */
function PrintButton({ label = 'Print', variant = 'secondary', children, ...props }: PrintButtonProps) {
  return (
    <Button variant={variant} onClick={() => window.print()} {...props}>
      <Printer />
      {children ?? label}
    </Button>
  )
}

export { PrintButton }
