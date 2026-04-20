import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { Order } from '@/types'
import { format, addDays } from 'date-fns'

const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 10, padding: 48, color: '#1a1a1a' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
  brand:        { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111' },
  brandSub:     { fontSize: 9, color: '#888', marginTop: 2 },
  docTitle:     { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111', textAlign: 'right' },
  docMeta:      { fontSize: 9, color: '#888', textAlign: 'right', marginTop: 3 },
  divider:      { borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 20 },
  section:      { marginBottom: 24 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  twoCol:       { flexDirection: 'row', gap: 48 },
  col:          { flex: 1 },
  boldText:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111' },
  mutedText:    { fontSize: 9, color: '#666', marginTop: 2 },
  addrText:     { fontSize: 9, color: '#555', lineHeight: 1.55 },
  tableHeader:  { flexDirection: 'row', backgroundColor: '#f5f5f5', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 },
  tableRow:     { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  colProduct:   { flex: 3 },
  colQty:       { flex: 1, textAlign: 'right' },
  colUnit:      { flex: 1, textAlign: 'right' },
  colTotal:     { flex: 1, textAlign: 'right' },
  colHeader:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase' },
  colCell:      { fontSize: 10, color: '#333' },
  colCellBold:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111' },
  totalsBlock:  { alignItems: 'flex-end', marginTop: 16 },
  totalRow:     { flexDirection: 'row', marginBottom: 5 },
  totalLabel:   { fontSize: 9, color: '#888', width: 96, textAlign: 'right', marginRight: 16 },
  totalValue:   { fontSize: 10, color: '#333', width: 80, textAlign: 'right' },
  grandLabel:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', width: 96, textAlign: 'right', marginRight: 16 },
  grandValue:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', width: 80, textAlign: 'right' },
  grandDivider: { borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 6 },
  paymentBox:   { marginTop: 36, backgroundColor: '#f9f9f9', borderRadius: 6, padding: 16, borderLeftWidth: 3, borderLeftColor: '#111' },
  paymentTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  paymentRow:   { flexDirection: 'row', marginBottom: 4 },
  paymentKey:   { fontSize: 9, color: '#888', width: 110 },
  paymentVal:   { fontSize: 9, color: '#111', fontFamily: 'Helvetica-Bold', flex: 1 },
  paymentNote:  { fontSize: 9, color: '#666', marginTop: 8, fontStyle: 'italic' },
  footer:       { position: 'absolute', bottom: 36, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:   { fontSize: 8, color: '#bbb' },
})

interface BillingAddress {
  line1?: string
  line2?: string
  city?: string
  postcode?: string
}

interface InvoicePDFProps {
  order: Order
  legalName?: string        // client legal entity name
  tradingName?: string      // client trading name
  billingAddress?: BillingAddress
  paymentTermsDays?: number
  supplierName?: string
  supplierAddress?: string
  bankDetails?: {
    accountName: string
    sortCode: string
    accountNumber: string
    reference?: string      // if empty, falls back to invoiceNumber
  }
}

export function InvoicePDF({
  order,
  legalName,
  tradingName,
  billingAddress,
  paymentTermsDays = 30,
  supplierName    = 'Foodlab Cocktails',
  supplierAddress = 'London, UK',
  bankDetails,
}: InvoicePDFProps) {
  const invoiceNumber = order.invoiceNumber ?? `INV-${order.orderNumber.replace('FL-', '')}`
  const issueDate     = order.deliveryDate ?? order.createdAt
  const dueDate       = addDays(issueDate, paymentTermsDays)

  // Payment reference: explicit → invoice number → order number
  const paymentRef = bankDetails?.reference || invoiceNumber

  const displayLegal   = legalName   ?? order.accountName
  const displayTrading = tradingName ?? ''

  const addressLines = [
    billingAddress?.line1,
    billingAddress?.line2,
    billingAddress?.city,
    billingAddress?.postcode,
  ].filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{supplierName}</Text>
            <Text style={s.brandSub}>{supplierAddress}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>Invoice</Text>
            <Text style={s.docMeta}>{invoiceNumber}</Text>
            <Text style={s.docMeta}>Issued: {format(issueDate, 'd MMMM yyyy')}</Text>
            <Text style={s.docMeta}>Due: {format(dueDate, 'd MMMM yyyy')}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Bill to + Order ref */}
        <View style={[s.section, s.twoCol]}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Bill to</Text>
            <Text style={s.boldText}>{displayLegal}</Text>
            {displayTrading && displayTrading !== displayLegal && (
              <Text style={s.mutedText}>{displayTrading}</Text>
            )}
            {addressLines.map((line, i) => (
              <Text key={i} style={s.addrText}>{line}</Text>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Order reference</Text>
            <Text style={s.boldText}>{order.orderNumber}</Text>
            {order.poReference && (
              <Text style={s.mutedText}>PO: {order.poReference}</Text>
            )}
            {order.deliveryNoteNumber && (
              <Text style={s.mutedText}>Delivery note: {order.deliveryNoteNumber}</Text>
            )}
          </View>
        </View>

        {/* Line items */}
        <View style={s.tableHeader}>
          <Text style={[s.colHeader, s.colProduct]}>Description</Text>
          <Text style={[s.colHeader, s.colQty]}>Qty (L)</Text>
          <Text style={[s.colHeader, s.colUnit]}>Price / L</Text>
          <Text style={[s.colHeader, s.colTotal]}>Amount</Text>
        </View>
        {order.lineItems.map((item, i) => (
          <View style={s.tableRow} key={i}>
            <Text style={[s.colCellBold, s.colProduct]}>{item.productName}</Text>
            <Text style={[s.colCell, s.colQty]}>{item.quantity}</Text>
            <Text style={[s.colCell, s.colUnit]}>£{item.unitPrice.toFixed(2)}</Text>
            <Text style={[s.colCell, s.colTotal]}>£{item.lineTotal.toFixed(2)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>£{order.subtotal.toFixed(2)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>VAT ({(order.vatRate * 100).toFixed(0)}%)</Text>
            <Text style={s.totalValue}>£{order.vatAmount.toFixed(2)}</Text>
          </View>
          <View style={[s.totalRow, s.grandDivider]}>
            <Text style={s.grandLabel}>Total due</Text>
            <Text style={s.grandValue}>£{order.total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Payment details */}
        {bankDetails && (
          <View style={s.paymentBox}>
            <Text style={s.paymentTitle}>Payment details</Text>
            {[
              ['Account name',   bankDetails.accountName],
              ['Sort code',      bankDetails.sortCode],
              ['Account number', bankDetails.accountNumber],
              ['Reference',      paymentRef],
            ].map(([k, v]) => (
              <View style={s.paymentRow} key={k}>
                <Text style={s.paymentKey}>{k}</Text>
                <Text style={s.paymentVal}>{v}</Text>
              </View>
            ))}
            <Text style={s.paymentNote}>
              Payment due by {format(dueDate, 'd MMMM yyyy')} — {paymentTermsDays} day terms.
              Please quote reference {paymentRef} when making payment.
            </Text>
          </View>
        )}

        {order.notes && (
          <View style={{ marginTop: 20 }}>
            <Text style={s.sectionLabel}>Notes</Text>
            <Text style={{ fontSize: 9, color: '#666' }}>{order.notes}</Text>
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>{supplierName}</Text>
          <Text style={s.footerText}>{invoiceNumber}</Text>
        </View>
      </Page>
    </Document>
  )
}

export default InvoicePDF