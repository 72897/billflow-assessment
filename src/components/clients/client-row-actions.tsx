'use client'

import { FilePlus2, MoreHorizontal, Pencil, Trash2, User } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { DeleteClientDialog } from '@/components/clients/delete-client-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ClientRowActionsProps {
  client: { id: string; name: string; invoiceCount: number }
  /** Where to go after a delete or archive. The list stays put; a detail page cannot. */
  redirectTo?: string
  /** Dropped on the client's own page, where "View client" is where you already are. */
  showView?: boolean
}

/**
 * The per-row overflow menu on the clients list: view, edit, invoice, delete.
 *
 * It is a small client island inside a server-rendered table - the rows
 * themselves ship no JavaScript. `asChild` on the menu items keeps them real
 * links, so middle-click and "open in new tab" behave the way a link should.
 */
function ClientRowActions({ client, redirectTo, showView = true }: ClientRowActionsProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${client.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {showView ? (
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}`}>
                <User />
                View client
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={`/clients/${client.id}/edit`}>
              <Pencil />
              Edit details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/invoices/new?client=${client.id}`}>
              <FilePlus2 />
              New invoice
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirming(true)}>
            <Trash2 />
            {client.invoiceCount > 0 ? 'Archive client' : 'Delete client'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteClientDialog open={confirming} onOpenChange={setConfirming} client={client} redirectTo={redirectTo} />
    </>
  )
}

export { ClientRowActions }
