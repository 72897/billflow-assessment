import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * A table that survives a phone.
 *
 * The wrapper scrolls horizontally rather than letting the layout squash, and
 * every list screen also renders a card list below `sm:` - the table is for
 * tablets upwards. Header cells stay put while the body scrolls.
 */
const TableWrap = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('w-full overflow-x-auto', className)} {...props} />
))
TableWrap.displayName = 'TableWrap'

const Table = forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
  ),
)
Table.displayName = 'Table'

const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('bg-secondary/70', className)} {...props} />,
)
TableHeader.displayName = 'TableHeader'

const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('divide-y divide-border', className)} {...props} />
  ),
)
TableBody.displayName = 'TableBody'

/**
 * `group` on an interactive row lets a cell react to a hover anywhere in it -
 * the chevron that fades in at the end of an invoice row, for instance. The
 * `focus-within` state matters as much as the hover: tabbing through a list
 * should highlight the row you have landed in, not just outline one link.
 */
const TableRow = forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }
>(({ className, interactive, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'transition-colors duration-100',
      interactive && 'group cursor-pointer hover:bg-secondary/70 focus-within:bg-secondary/70',
      className,
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

const TableHead = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 whitespace-nowrap border-b border-border px-4 text-left align-middle text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
)
TableHead.displayName = 'TableHead'

const TableCell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-4 py-3 align-middle', className)} {...props} />
  ),
)
TableCell.displayName = 'TableCell'

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap }
