'use client'

import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DeleteClientDialog } from '@/components/clients/delete-client-dialog'
import { Button } from '@/components/ui/button'

export interface DeleteClientButtonProps {
  client: { id: string; name: string; invoiceCount: number }
  /** Where to go once the client is gone - the edit screen cannot stay put. */
  redirectTo?: string
}

/**
 * The destructive action in the edit form's footer.
 *
 * Its own component because the dialog needs state and the edit page is a server
 * component; keeping the pair together means the page passes data, not handlers.
 * The label follows the same rule as the dialog: a client with invoices is
 * archived, so promising to delete them would be a lie.
 */
function DeleteClientButton({ client, redirectTo }: DeleteClientButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const archive = client.invoiceCount > 0

  return (
    <>
      <Button type="button" variant="danger-outline" onClick={() => setConfirming(true)}>
        <Trash2 />
        {archive ? 'Archive client' : 'Delete client'}
      </Button>
      <DeleteClientDialog open={confirming} onOpenChange={setConfirming} client={client} redirectTo={redirectTo} />
    </>
  )
}

export { DeleteClientButton }
