'use client'

import { Banknote, CreditCard, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Field, FieldTextarea } from '@/components/ui/field'
import { RadioCard, RadioGroup } from '@/components/ui/radio-group'
import { api, errorMessage, newIdempotencyKey } from '@/lib/api/client'
import { formatMoney } from '@/lib/money'
import type { Payment, PublicInvoice } from '@/types'

/** What the panel needs to draw the receipt once the payment lands. */
export interface PaymentSuccess {
  reference: string
  amount: number
  currency: string
  method: Payment['method']
  cardLast4: string | null
  paidAt: string
  /** The idempotency key matched an earlier attempt - nothing was charged twice. */
  alreadyPaid: boolean
  receiptSent: boolean
}

export interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  invoiceNumber: string
  businessName: string
  /** Minor units, echoed to the server so a changed total cannot be paid blind. */
  total: number
  currency: string
  onPaid: (result: PaymentSuccess) => void
}

type Method = 'card' | 'bank_transfer'

const METHODS: Array<{ value: Method; title: string; description: string; icon: React.ReactNode }> = [
  { value: 'card', title: 'Card', description: 'Visa, Mastercard, Amex', icon: <CreditCard /> },
  { value: 'bank_transfer', title: 'Bank transfer', description: 'Pay from your bank account', icon: <Banknote /> },
]

/**
 * Screen 18 - the payment sheet on the public link.
 *
 * There is no card form, and that is the honest design rather than a shortcut:
 * settlement here does not run through a processor, so asking for a card number
 * would be collecting something this app has no business holding. The disclosure
 * says so in plain words, because a client who believes they have paid an invoice
 * they have not is the worst outcome this screen can produce.
 *
 * The parts that would matter with a real processor are all real: the total is
 * echoed back and rejected if it moved (PAY-05), one idempotency key is minted
 * per opening so a double-tapped Pay button settles once (PAY-03), and a failure
 * leaves the invoice unpaid with the sheet still open to retry (PAY-06).
 */
function PaymentDialog({
  open,
  onOpenChange,
  token,
  invoiceNumber,
  businessName,
  total,
  currency,
  onPaid,
}: PaymentDialogProps) {
  const [method, setMethod] = useState<Method>('card')
  const [note, setNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(newIdempotencyKey)

  useEffect(() => {
    if (!open) return
    setError(null)
    setKey(newIdempotencyKey())
  }, [open])

  async function pay() {
    setPaying(true)
    setError(null)
    try {
      const data = await api.post<{
        invoice: PublicInvoice
        payment: Payment
        alreadyPaid: boolean
        receiptSent: boolean
      }>(`/api/public/invoices/${token}/pay`, {
        method,
        payerNote: note,
        idempotencyKey: key,
        expectedTotal: String(total),
      })

      onPaid({
        reference: data.payment.reference,
        amount: data.payment.amount,
        currency: data.payment.currency || currency,
        method: data.payment.method,
        cardLast4: data.payment.cardLast4,
        paidAt: data.payment.paidAt,
        alreadyPaid: data.alreadyPaid,
        receiptSent: data.receiptSent,
      })
      onOpenChange(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={paying ? undefined : onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Pay {formatMoney(total, currency)}</DialogTitle>
          <DialogDescription>
            Invoice {invoiceNumber} from {businessName}.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <FormError message={error} />

          <div>
            <p className="mb-2 text-[13px] font-medium">How would you like to pay?</p>
            <RadioGroup value={method} onValueChange={(value) => setMethod(value as Method)}>
              {METHODS.map((option) => (
                <RadioCard
                  key={option.value}
                  value={option.value}
                  title={option.title}
                  description={option.description}
                  icon={option.icon}
                  disabled={paying}
                />
              ))}
            </RadioGroup>
          </div>

          <Field
            label={`Message for ${businessName}`}
            optional
            hint="Goes on the payment record - a PO number, say."
          >
            <FieldTextarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              placeholder="Paid against PO 88213 - thanks!"
              disabled={paying}
            />
          </Field>

          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              No card details are collected or stored. Confirming records the payment against this invoice and emails a
              receipt to the address above.
            </span>
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={paying}>
            Cancel
          </Button>
          <Button onClick={() => void pay()} loading={paying}>
            {paying ? 'Processing…' : `Pay ${formatMoney(total, currency)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { PaymentDialog }
