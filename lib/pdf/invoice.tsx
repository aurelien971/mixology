import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { Order } from '@/types'
import { format, addDays } from 'date-fns'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 48,
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 36,
  },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111' },
  brandSub: { fontSize: 9, color: '#888', marginTop: 2 },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111', textAlign: 'right' },
  docMeta: { fontSize: 9, color: '#888', textAlign: 'right', marginTop: 3 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  twoCol: { flexDirection: 'row', gap: 48 },
  col: { flex: 1 },
  addressText: { fontSize: 10, lineHeight: 1.6, color: '#333' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  colProduct: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colUnit: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1, textAlign: 'right' },
  colHeader: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase' },
  colCell: { fontSize: 10, color: '#333' },
  colCellBold: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111' },
  totalsBlock: { alignItems: 'flex-end', marginTop: 16 },
  totalRow: { flexDirection: 'row', marginBottom: 5 },
  totalLabel: { fontSize: 9, color: '#888', width: 96, textAlign: 'right', marginRight: 16 },
  totalValue: { fontSize: 10, color: '#333', width: 80, textAlign: 'right' },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', width: 96, textAlign: 'right', marginRight: 16 },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', width: 80, textAlign: 'right' },
  grandDivider: { borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 6 },
  paymentBox: {
    marginTop: 36,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 16,
  },
  paymentTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#555', marginBottom: 6 },
  paymentText: { fontSize: 9, color: '#666', lineHeight: 1.6 },
  footer: {
    position: 'absolute',
    bottom: 36,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: '#bbb' },
})

interface InvoicePDFProps {
  order: Order
  paymentTermsDays?: number
  supplierName?: string
  supplierAddress?: string
  bankDetails?: {
    accountName: string
    sortCode: string
    accountNumber: string
    reference?: string
  }
}

export function InvoicePDF({
  order,
  paymentTermsDays = 30,
  supplierName = 'Foodlab Cocktails',
  supplierAddress = 'London, UK',
  bankDetails,
}: InvoicePDFProps) {
  const invoiceNumber = order.invoiceNumber ?? `INV-${order.orderNumber.replace('FL-', '')}`
  const issueDate = order.deliveryDate ?? order.createdAt
  const dueDate = addDays(issueDate, paymentTermsDays)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{supplierName}</Text>
            <Text style={styles.brandSub}>{supplierAddress}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Invoice</Text>
            <Text style={styles.docMeta}>{invoiceNumber}</Text>
            <Text style={styles.docMeta}>Issued: {format(issueDate, 'd MMMM yyyy')}</Text>
            <Text style={styles.docMeta}>Due: {format(dueDate, 'd MMMM yyyy')}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={[styles.section, styles.twoCol]}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Bill to</Text>
            <Text style={styles.addressText}>{order.accountName}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Order reference</Text>
            <Text style={styles.addressText}>{order.orderNumber}</Text>
            {order.poReference && (
              <Text style={styles.addressText}>PO: {order.poReference}</Text>
            )}
            {order.deliveryNoteNumber && (
              <Text style={styles.addressText}>Delivery note: {order.deliveryNoteNumber}</Text>
            )}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colHeader, styles.colProduct]}>Description</Text>
          <Text style={[styles.colHeader, styles.colQty]}>Qty</Text>
          <Text style={[styles.colHeader, styles.colUnit]}>Unit price</Text>
          <Text style={[styles.colHeader, styles.colTotal]}>Amount</Text>
        </View>

        {order.lineItems.map((item, i) => (
          <View style={styles.tableRow} key={i}>
            <Text style={[styles.colCellBold, styles.colProduct]}>{item.productName}</Text>
            <Text style={[styles.colCell, styles.colQty]}>{item.quantity}</Text>
            <Text style={[styles.colCell, styles.colUnit]}>£{item.unitPrice.toFixed(2)}</Text>
            <Text style={[styles.colCell, styles.colTotal]}>£{item.lineTotal.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>£{order.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>VAT ({(order.vatRate * 100).toFixed(0)}%)</Text>
            <Text style={styles.totalValue}>£{order.vatAmount.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandDivider]}>
            <Text style={styles.grandLabel}>Total due</Text>
            <Text style={styles.grandValue}>£{order.total.toFixed(2)}</Text>
          </View>
        </View>

        {bankDetails && (
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>Payment details</Text>
            <Text style={styles.paymentText}>Account name: {bankDetails.accountName}</Text>
            <Text style={styles.paymentText}>Sort code: {bankDetails.sortCode}</Text>
            <Text style={styles.paymentText}>Account number: {bankDetails.accountNumber}</Text>
            {bankDetails.reference && (
              <Text style={styles.paymentText}>
                Reference: {bankDetails.reference ?? invoiceNumber}
              </Text>
            )}
            <Text style={[styles.paymentText, { marginTop: 6 }]}>
              Payment due by {format(dueDate, 'd MMMM yyyy')} ({paymentTermsDays} day terms)
            </Text>
          </View>
        )}

        {order.notes && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={{ fontSize: 9, color: '#666' }}>{order.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{supplierName}</Text>
          <Text style={styles.footerText}>{invoiceNumber}</Text>
        </View>
      </Page>
    </Document>
  )
}

export default InvoicePDF