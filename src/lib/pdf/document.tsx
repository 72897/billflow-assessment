/**
 * The PDF invoice and receipt.
 *
 * Rendered with @react-pdf/renderer on the server, so the file a client
 * downloads is identical whatever browser they use, and the layout does not
 * depend on print CSS behaving. Only the built-in Helvetica family is used: no
 * font is fetched at runtime, which keeps this working on a cold serverless
 * instance with no network egress.
 */

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ComponentProps } from 'react'
import { formatAmountExact, formatMoney, formatQuantity, formatRate, sumInWords } from '@/lib/money'
import { discountLabel } from '@/lib/invoice/calc'
import { formatDate } from '@/lib/utils'
import type { DiscountType, DisplayStatus, InvoiceItem } from '@/types'

export interface InvoicePdfData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  displayStatus: DisplayStatus
  currency: string
  items: InvoiceItem[]
  subtotal: number
  discountType: DiscountType | null
  discountValue: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  notes: string
  business: {
    businessName: string
    businessEmail: string
    phone: string
    address: string
    taxId: string
    logoUrl: string | null
  }
  client: { name: string; company: string; email: string; address: string; phone: string }
  payment: { reference: string; amount: number; method: string; cardLast4: string | null; paidAt: string } | null
}

const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const BRAND = '#4f46e5'

/**
 * react-pdf's own style prop type, taken from `<View>` because `<Text>` is
 * overloaded with an SVG variant whose style type is a different shape.
 */
type TextStyle = ComponentProps<typeof View>['style']

const STATUS_COLOR: Record<DisplayStatus, string> = {
  draft: '#64748b',
  sent: '#1d4ed8',
  paid: '#047857',
  overdue: '#b91c1c',
}

const STATUS_BACKGROUND: Record<DisplayStatus, string> = {
  draft: '#f1f5f9',
  sent: '#eff6ff',
  paid: '#ecfdf5',
  overdue: '#fef2f2',
}

/**
 * react-pdf rasterises PNG and JPEG only. An SVG logo renders beautifully in the
 * browser and throws here, so it is skipped rather than allowed to fail a
 * download.
 */
export function pdfSafeLogo(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null
  if (/^data:image\/(png|jpe?g);base64,/i.test(logoUrl)) return logoUrl
  if (/^https?:\/\/.+\.(png|jpe?g)(\?|$)/i.test(logoUrl)) return logoUrl
  return null
}

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: INK, fontFamily: 'Helvetica' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 108, maxHeight: 42, objectFit: 'contain', marginBottom: 8 },
  businessName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  businessLine: { color: MUTED, lineHeight: 1.5 },

  headerRight: { alignItems: 'flex-end', maxWidth: 210 },
  docTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: 1.4, color: INK },
  docNumber: { fontSize: 11, color: BRAND, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  pill: { marginTop: 7, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 9, fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },

  rule: { borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 20, marginBottom: 18 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaBlock: { width: '48%' },
  metaLabel: { fontSize: 7.5, letterSpacing: 0.8, color: MUTED, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  metaName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  metaLine: { color: MUTED, lineHeight: 1.5 },
  metaPair: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaPairValue: { fontFamily: 'Helvetica-Bold' },

  tableHead: { flexDirection: 'row', backgroundColor: '#f8fafc', borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE, paddingVertical: 7, paddingHorizontal: 6, marginTop: 22 },
  tableHeadCell: { fontSize: 7.5, letterSpacing: 0.7, color: MUTED, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 8, paddingHorizontal: 6 },
  cellDescription: { width: '46%', paddingRight: 8 },
  cellQty: { width: '13%', textAlign: 'right' },
  cellRate: { width: '19%', textAlign: 'right' },
  cellAmount: { width: '22%', textAlign: 'right' },
  itemName: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  itemDetail: { color: MUTED, fontSize: 8.5, lineHeight: 1.4 },

  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  totals: { width: '52%' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalsLabel: { color: MUTED },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 8, backgroundColor: '#f8fafc', borderRadius: 4 },
  grandLabel: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 12.5, fontFamily: 'Helvetica-Bold' },
  words: { marginTop: 8, color: MUTED, fontSize: 8.5, fontStyle: 'italic' },

  notesBox: { marginTop: 22, borderLeftWidth: 2, borderLeftColor: LINE, paddingLeft: 10 },
  notesLabel: { fontSize: 7.5, letterSpacing: 0.8, color: MUTED, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  notesBody: { color: '#334155', lineHeight: 1.6 },

  paidBox: { marginTop: 22, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 6, padding: 12 },
  paidTitle: { fontFamily: 'Helvetica-Bold', color: '#047857', marginBottom: 4, fontSize: 10 },
  paidLine: { color: '#065f46', lineHeight: 1.5 },

  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7.5, color: MUTED },
})

/** Splits a multi-line address into `<Text>` rows so wrapping stays predictable. */
function Lines({ value, style }: { value: string; style?: TextStyle }) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
  return (
    <>
      {lines.map((line, index) => (
        <Text key={index} style={style}>
          {line}
        </Text>
      ))}
    </>
  )
}

function Header({ data }: { data: InvoicePdfData }) {
  const logo = pdfSafeLogo(data.business.logoUrl)
  const label = data.displayStatus.toUpperCase()

  return (
    <View style={styles.headerRow}>
      <View style={{ maxWidth: 250 }}>
        {/* `@react-pdf/renderer`'s Image draws into a PDF and has no alt attribute;
            the accessible name of a PDF page is its text, which follows below. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {logo ? <Image style={styles.logo} src={logo} /> : null}
        <Text style={styles.businessName}>{data.business.businessName || 'Your business'}</Text>
        <Lines value={data.business.address} style={styles.businessLine} />
        {data.business.businessEmail ? <Text style={styles.businessLine}>{data.business.businessEmail}</Text> : null}
        {data.business.phone ? <Text style={styles.businessLine}>{data.business.phone}</Text> : null}
        {data.business.taxId ? <Text style={styles.businessLine}>Tax ID: {data.business.taxId}</Text> : null}
      </View>

      <View style={styles.headerRight}>
        <Text style={styles.docTitle}>INVOICE</Text>
        <Text style={styles.docNumber}>{data.invoiceNumber}</Text>
        <Text
          style={{
            ...styles.pill,
            color: STATUS_COLOR[data.displayStatus],
            backgroundColor: STATUS_BACKGROUND[data.displayStatus],
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  )
}

function Parties({ data }: { data: InvoicePdfData }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaBlock}>
        <Text style={styles.metaLabel}>BILLED TO</Text>
        <Text style={styles.metaName}>{data.client.name}</Text>
        {data.client.company ? <Text style={styles.metaLine}>{data.client.company}</Text> : null}
        <Lines value={data.client.address} style={styles.metaLine} />
        {data.client.email ? <Text style={styles.metaLine}>{data.client.email}</Text> : null}
        {data.client.phone ? <Text style={styles.metaLine}>{data.client.phone}</Text> : null}
      </View>

      <View style={styles.metaBlock}>
        <Text style={styles.metaLabel}>DETAILS</Text>
        <View style={styles.metaPair}>
          <Text style={styles.metaLine}>Issue date</Text>
          <Text style={styles.metaPairValue}>{formatDate(data.issueDate, 'long')}</Text>
        </View>
        <View style={styles.metaPair}>
          <Text style={styles.metaLine}>Due date</Text>
          <Text style={styles.metaPairValue}>{formatDate(data.dueDate, 'long')}</Text>
        </View>
        <View style={styles.metaPair}>
          <Text style={styles.metaLine}>Currency</Text>
          <Text style={styles.metaPairValue}>{data.currency}</Text>
        </View>
        <View style={styles.metaPair}>
          <Text style={styles.metaLine}>{data.payment ? 'Amount paid' : 'Amount due'}</Text>
          <Text style={styles.metaPairValue}>{formatMoney(data.total, data.currency)}</Text>
        </View>
      </View>
    </View>
  )
}

function ItemsTable({ data }: { data: InvoicePdfData }) {
  return (
    <>
      <View style={styles.tableHead} fixed>
        <Text style={{ ...styles.tableHeadCell, ...styles.cellDescription }}>DESCRIPTION</Text>
        <Text style={{ ...styles.tableHeadCell, ...styles.cellQty }}>QTY</Text>
        <Text style={{ ...styles.tableHeadCell, ...styles.cellRate }}>RATE</Text>
        <Text style={{ ...styles.tableHeadCell, ...styles.cellAmount }}>AMOUNT</Text>
      </View>

      {data.items.map((item) => (
        <View key={item.id} style={styles.row} wrap={false}>
          <View style={styles.cellDescription}>
            <Text style={styles.itemName}>{item.description}</Text>
            {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
          </View>
          <Text style={styles.cellQty}>{formatQuantity(item.quantity)}</Text>
          <Text style={styles.cellRate}>{formatAmountExact(item.rate, data.currency)}</Text>
          <Text style={{ ...styles.cellAmount, fontFamily: 'Helvetica-Bold' }}>
            {formatAmountExact(item.amount, data.currency)}
          </Text>
        </View>
      ))}
    </>
  )
}

function Totals({ data }: { data: InvoicePdfData }) {
  return (
    <View style={styles.totalsWrap}>
      <View style={styles.totals}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text>{formatAmountExact(data.subtotal, data.currency)}</Text>
        </View>

        {data.discountAmount > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount {discountLabel(data.discountType, data.discountValue)}</Text>
            <Text>-{formatAmountExact(data.discountAmount, data.currency)}</Text>
          </View>
        ) : null}

        {data.taxRate > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax ({formatRate(data.taxRate)}%)</Text>
            <Text>{formatAmountExact(data.taxAmount, data.currency)}</Text>
          </View>
        ) : null}

        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>{data.payment ? 'Total paid' : 'Total due'}</Text>
          <Text style={styles.grandValue}>{formatMoney(data.total, data.currency)}</Text>
        </View>

        <Text style={styles.words}>{sumInWords(data.total, data.currency)}</Text>
      </View>
    </View>
  )
}

const METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  manual: 'Recorded manually',
}

function PaymentBox({ data }: { data: InvoicePdfData }) {
  if (!data.payment) return null
  const method = METHOD_LABEL[data.payment.method] ?? data.payment.method
  const suffix = data.payment.cardLast4 ? ` ending ${data.payment.cardLast4}` : ''

  return (
    <View style={styles.paidBox}>
      <Text style={styles.paidTitle}>Paid in full - thank you</Text>
      <Text style={styles.paidLine}>
        {formatMoney(data.payment.amount, data.currency)} received on {formatDate(data.payment.paidAt, 'long')} by{' '}
        {method}
        {suffix}.
      </Text>
      <Text style={styles.paidLine}>Reference {data.payment.reference}</Text>
    </View>
  )
}

function Footer({ data, kind }: { data: InvoicePdfData; kind: 'invoice' | 'receipt' }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        {kind === 'receipt' ? 'Receipt for' : 'Invoice'} {data.invoiceNumber} · {data.business.businessName}
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  return (
    <Document
      title={`Invoice ${data.invoiceNumber}`}
      author={data.business.businessName || 'BillFlow'}
      subject={`Invoice ${data.invoiceNumber} for ${data.client.name}`}
      creator="BillFlow"
      producer="BillFlow"
    >
      <Page size="A4" style={styles.page}>
        <Header data={data} />
        <View style={styles.rule} />
        <Parties data={data} />
        <ItemsTable data={data} />
        <Totals data={data} />
        <PaymentBox data={data} />

        {data.notes ? (
          <View style={styles.notesBox} wrap={false}>
            <Text style={styles.notesLabel}>NOTES &amp; PAYMENT TERMS</Text>
            <Lines value={data.notes} style={styles.notesBody} />
          </View>
        ) : null}

        <Footer data={data} kind="invoice" />
      </Page>
    </Document>
  )
}

const receiptStyles = StyleSheet.create({
  banner: { marginTop: 20, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 8, padding: 18, alignItems: 'center' },
  bannerAmount: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#047857' },
  bannerLabel: { fontSize: 8, letterSpacing: 1, color: '#047857', fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  bannerNote: { color: '#065f46', marginTop: 6 },
  block: { marginTop: 22, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  blockRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: LINE },
  blockRowLast: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12 },
  blockLabel: { color: MUTED },
  blockValue: { fontFamily: 'Helvetica-Bold' },
})

/** A payment receipt: the same letterhead, but the amount is the headline. */
export function ReceiptPdf({ data }: { data: InvoicePdfData }) {
  const payment = data.payment
  const method = payment ? (METHOD_LABEL[payment.method] ?? payment.method) : '-'

  const rows: Array<[string, string]> = [
    ['Receipt for invoice', data.invoiceNumber],
    ['Paid by', data.client.company || data.client.name],
    ['Payment method', payment?.cardLast4 ? `${method} ending ${payment.cardLast4}` : method],
    ['Reference', payment?.reference ?? '-'],
    ['Payment date', payment ? formatDate(payment.paidAt, 'long') : '-'],
    ['Invoice issued', formatDate(data.issueDate, 'long')],
  ]

  return (
    <Document
      title={`Receipt ${data.invoiceNumber}`}
      author={data.business.businessName || 'BillFlow'}
      subject={`Payment receipt for invoice ${data.invoiceNumber}`}
      creator="BillFlow"
      producer="BillFlow"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ maxWidth: 250 }}>
            {pdfSafeLogo(data.business.logoUrl) ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- a PDF Image, not an <img>
              <Image style={styles.logo} src={pdfSafeLogo(data.business.logoUrl)!} />
            ) : null}
            <Text style={styles.businessName}>{data.business.businessName || 'Your business'}</Text>
            <Lines value={data.business.address} style={styles.businessLine} />
            {data.business.businessEmail ? (
              <Text style={styles.businessLine}>{data.business.businessEmail}</Text>
            ) : null}
            {data.business.taxId ? <Text style={styles.businessLine}>Tax ID: {data.business.taxId}</Text> : null}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>RECEIPT</Text>
            <Text style={styles.docNumber}>{payment?.reference ?? data.invoiceNumber}</Text>
          </View>
        </View>

        <View style={receiptStyles.banner}>
          <Text style={receiptStyles.bannerLabel}>AMOUNT PAID</Text>
          <Text style={receiptStyles.bannerAmount}>{formatMoney(payment?.amount ?? data.total, data.currency)}</Text>
          <Text style={receiptStyles.bannerNote}>{sumInWords(payment?.amount ?? data.total, data.currency)}</Text>
        </View>

        <View style={receiptStyles.block}>
          {rows.map(([label, value], index) => (
            <View key={label} style={index === rows.length - 1 ? receiptStyles.blockRowLast : receiptStyles.blockRow}>
              <Text style={receiptStyles.blockLabel}>{label}</Text>
              <Text style={receiptStyles.blockValue}>{value}</Text>
            </View>
          ))}
        </View>

        <ItemsTable data={data} />
        <Totals data={data} />

        <Footer data={data} kind="receipt" />
      </Page>
    </Document>
  )
}
