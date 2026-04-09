import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { Order } from '@/types'
import { format } from 'date-fns'

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
  brand: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#111',
  },
  brandSub: {
    fontSize: 9,
    color: '#888',
    marginTop: 2,
  },
  docTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#111',
    textAlign: 'right',
  },
  docMeta: {
    fontSize: 9,
    color: '#888',
    textAlign: 'right',
    marginTop: 3,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  addressBlock: {
    fontSize: 10,
    lineHeight: 1.6,
    color: '#333',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 20,
  },
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
  colServing: { flex: 1, textAlign: 'right' },
  colQty: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1, textAlign: 'right' },
  colHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#888',
    textTransform: 'uppercase',
  },
  colCell: {
    fontSize: 10,
    color: '#333',
  },
  colCellBold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111',
  },
  totalsSection: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
    marginBottom: 4,
  },
  totalLabel: { fontSize: 9, color: '#888', width: 80, textAlign: 'right' },
  totalValue: { fontSize: 10, color: '#333', width: 80, textAlign: 'right' },
  grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', width: 80, textAlign: 'right' },
  grandTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', width: 80, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 36,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#bbb',
  },
  signatureBox: {
    marginTop: 48,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 8,
    flexDirection: 'row',
    gap: 48,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#aaa',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    width: 160,
    marginTop: 24,
    marginBottom: 4,
  },
})

interface DeliveryNoteProps {
  order: Order
  supplierName?: string
  supplierAddress?: string
}

export function DeliveryNotePDF({
  order,
  supplierName = 'Foodlab Cocktails',
  supplierAddress = 'London, UK',
}: DeliveryNoteProps) {
  const noteNumber = order.deliveryNoteNumber ?? `DN-${order.orderNumber.replace('FL-', '')}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{supplierName}</Text>
            <Text style={styles.brandSub}>{supplierAddress}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Delivery Note</Text>
            <Text style={styles.docMeta}>{noteNumber}</Text>
            <Text style={styles.docMeta}>
              {format(order.createdAt, 'd MMMM yyyy')}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={[styles.section, { flexDirection: 'row', gap: 48 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Deliver to</Text>
            <Text style={styles.addressBlock}>{order.accountName}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Order details</Text>
            <Text style={styles.addressBlock}>Order: {order.orderNumber}</Text>
            {order.poReference && (
              <Text style={styles.addressBlock}>PO ref: {order.poReference}</Text>
            )}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colHeader, styles.colProduct]}>Product</Text>
          <Text style={[styles.colHeader, styles.colServing]}>Serve size</Text>
          <Text style={[styles.colHeader, styles.colQty]}>Qty</Text>
          <Text style={[styles.colHeader, styles.colTotal]}>Total (units)</Text>
        </View>

        {order.lineItems.map((item, i) => (
          <View style={styles.tableRow} key={i}>
            <Text style={[styles.colCellBold, styles.colProduct]}>{item.productName}</Text>
            <Text style={[styles.colCell, styles.colServing]}>
              {item.servingSizeG > 0 ? `${item.servingSizeG}g` : '—'}
            </Text>
            <Text style={[styles.colCell, styles.colQty]}>{item.quantity}</Text>
            <Text style={[styles.colCell, styles.colTotal]}>{item.quantity}</Text>
          </View>
        ))}

        <View style={styles.signatureBox}>
          <View>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Received by (print name)</Text>
          </View>
          <View>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Signature</Text>
          </View>
          <View>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Date</Text>
          </View>
        </View>

        {order.notes && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={{ fontSize: 9, color: '#666' }}>{order.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{supplierName} — Confidential</Text>
          <Text style={styles.footerText}>{noteNumber}</Text>
        </View>
      </Page>
    </Document>
  )
}