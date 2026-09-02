'use client'

import { Banknote, CreditCard, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
import { toast } from '@/components/ui/toaster'
import { api, errorMessage, newIdempotencyKey } from '@/lib/api/client'
import { formatMoney } from '@/lib/money'
import type { InvoiceDetail, Payment } from '@/types'

export interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Pick<InvoiceDetail, 'id' | 'invoiceNumber' | 'clientName' | 'total' | 'currency'>
}

type Method = 'bank_transfer' | 'card' | 'manual'

const METHODS: Array<{ value: Method; title: string; description: string; icon: React.ReactNode }> = [
  { value: 'bank_transfer', title: 'Bank transfer', description: 'It landed in your account', icon: <Banknote /> },
  { value: 'card', title: 'Card', description: 'Taken on a reader or by phone', icon: <CreditCard /> },
  { value: 'manual', title: 'Cash or something else', description: 'Recorded by hand', icon: <Wallet /> },
]

/**
 * "Mark as paid" - money that arrived outside the app.
 *
 * The whole invoice is settled in one go: BillFlow records payments, not part
 * payments, so there is no amount to type and therefore no way to disagree with
 * the total. That is a deliberate limit rather than an omission - a partial
 * payment would need its own history, balance and receipt, and none of that is
 * worth carrying for a freelancer's first invoice.
 *
 * The idempotency key is minted once per opening, so a double-clicked button and
 * a retried request both settle the same payment once (PAY-04).
 */
function RecordPaymentDialog({ open, onOpenChange, invoice }: RecordPaymentDialogProps) {
  const router = useRouter()
  const [method, setMethod] = useState<Method>('bank_transfer')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(newIdempotencyKey)

  useEffect(() => {
    if (!open) return
    setError(null)
    setKey(newIdempotencyKey())
  }, [open])

  async function record() {
    setSaving(true)
    setError(null)
    try {
      const data = await api.post<{ invoice: InvoiceDetail; payment: Payment; alreadyPaid: boolean }>(
        `/api/invoices/${invoice.id}/payment`,
        { method, note, idempotencyKey: key },
      )
      toast.success(data.alreadyPaid ? `${invoice.invoiceNumber} was already paid` : `${invoice.invoiceNumber} is paid`, {
        description: data.alreadyPaid
          ? 'Nothing changed - the payment on record stands.'
          : `${formatMoney(invoice.total, invoice.currency)} recorded. A receipt is ready to download.`,
      })
      setNote('')
      onOpenChange(false)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Mark {invoice.invoiceNumber} as paid</DialogTitle>
          <DialogDescription>
            Records {formatMoney(invoice.total, invoice.currency)} from {invoice.clientName} and closes the invoice.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <FormError message={error} />

          <div>
            <p className="mb-2 text-[13px] font-medium">How did it arrive?</p>
            <RadioGroup value={method} onValueChange={(value) => setMethod(value as Method)}>
              {METHODS.map((option) => (
                <RadioCard
                  key={option.value}
                  value={option.value}
                  title={option.title}
                  description={option.description}
                  icon={option.icon}
                  disabled={saving}
                />
              ))}
            </RadioGroup>
          </div>

          <Field label="Note" optional hint="Only you see this - a transaction reference, say.">
            <FieldTextarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              placeholder="NEFT ref 4471902"
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => void record()} loading={saving}>
            {saving ? 'Recording…' : 'Mark as paid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { RecordPaymentDialog }


