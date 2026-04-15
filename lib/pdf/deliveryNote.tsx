import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { Order } from '@/types'
import { format } from 'date-fns'

const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 9, padding: '40 44', color: '#1a1a1a' },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  brand:        { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  brandSub:     { fontSize: 8, color: '#999', marginTop: 2 },
  docTitle:     { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta:      { fontSize: 8, color: '#999', textAlign: 'right', marginTop: 2 },
  divider:      { borderBottomWidth: 1, borderBottomColor: '#e0e0e0', marginBottom: 14 },

  // Meta grid
  metaBox:      { borderWidth: 1, borderColor: '#ccc', marginBottom: 14 },
  metaRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  metaRowLast:  { flexDirection: 'row' },
  metaCell:     { flex: 1, padding: '4 8' },
  metaCellR:    { flex: 1, padding: '4 8', borderLeftWidth: 1, borderLeftColor: '#ccc' },
  metaLabel:    { fontSize: 7, color: '#888', marginBottom: 1 },
  metaValue:    { fontSize: 9, fontFamily: 'Helvetica-Bold' },

  // Deliver to — legal name is primary
  deliverBlock: { marginBottom: 14 },
  deliverLabel: { fontSize: 7, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  legalName:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111' },
  tradingName:  { fontSize: 9, color: '#888', marginTop: 2 },

  // Table
  tableLabel:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  thRow:        { flexDirection: 'row', backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ccc', padding: '5 8' },
  tdRow:        { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#ccc', padding: '6 8' },
  colCode:      { width: 72 },
  colName:      { flex: 1 },
  colQty:       { width: 64, textAlign: 'right' },
  thText:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555' },
  tdCode:       { fontSize: 8, color: '#aaa', width: 72 },
  tdName:       { fontSize: 9, fontFamily: 'Helvetica-Bold', flex: 1 },
  tdQty:        { fontSize: 9, fontFamily: 'Helvetica-Bold', width: 64, textAlign: 'right' },
  totRow:       { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#ccc', padding: '5 8', backgroundColor: '#f9f9f9' },
  totLabel:     { flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textAlign: 'right', paddingRight: 8 },
  totVal:       { width: 64, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  // Signatures — VERTICAL stack, two per row using a grid-like layout
  sigSection:   { marginTop: 28 },
  sigSectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sigRow:       { flexDirection: 'row', marginBottom: 24, gap: 32 },
  sigBox:       { flex: 1 },
  sigLine:      { borderBottomWidth: 1, borderBottomColor: '#aaa', marginBottom: 6, marginTop: 28 },
  sigLabel:     { fontSize: 8, color: '#555', fontFamily: 'Helvetica-Bold' },
  sigSub:       { fontSize: 7, color: '#aaa', marginTop: 2 },

  notesBox:     { marginTop: 14, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 3 },
  notesLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#888', marginBottom: 3, textTransform: 'uppercase' },
  notesText:    { fontSize: 8, color: '#555' },
  footer:       { position: 'absolute', bottom: 28, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:   { fontSize: 7, color: '#bbb' },
})

interface DeliveryNoteProps {
  order: Order
  legalName?: string
  tradingName?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    postcode?: string
  }
  supplierName?: string
  supplierAddress?: string
  supplierPhone?: string
}

export function DeliveryNotePDF({
  order,
  legalName,
  tradingName,
  address,
  supplierName    = 'Foodlab Cocktails',
  supplierAddress = 'London, UK',
  supplierPhone   = '',
}: DeliveryNoteProps) {
  const noteNumber = order.deliveryNoteNumber ?? `DN-${order.orderNumber.replace('FL-', '')}`
  const noteDate   = order.deliveryDate ?? order.createdAt
  const totalUnits = order.lineItems.reduce((sum, l) => sum + l.quantity, 0)

  // Use provided names or fall back to accountName
  const displayLegal   = legalName   ?? order.accountName
  const displayTrading = tradingName ?? ''

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>{supplierName}</Text>
            <Text style={s.brandSub}>{supplierAddress}{supplierPhone ? ` · ${supplierPhone}` : ''}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>DELIVERY NOTE</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Meta grid */}
        <View style={s.metaBox}>
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>D/Note No.</Text>
              <Text style={s.metaValue}>{noteNumber}</Text>
            </View>
            <View style={s.metaCellR}>
              <Text style={s.metaLabel}>Order No.</Text>
              <Text style={s.metaValue}>{order.orderNumber}</Text>
            </View>
            <View style={s.metaCellR}>
              <Text style={s.metaLabel}>PO Ref.</Text>
              <Text style={s.metaValue}>{order.poReference ?? '—'}</Text>
            </View>
            <View style={s.metaCellR}>
              <Text style={s.metaLabel}>D/Note Date</Text>
              <Text style={s.metaValue}>{format(noteDate, 'd MMM yyyy')}</Text>
            </View>
          </View>
          <View style={s.metaRowLast}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Total units (litres)</Text>
              <Text style={s.metaValue}>{totalUnits}</Text>
            </View>
            <View style={s.metaCellR}>
              <Text style={s.metaLabel}>Items</Text>
              <Text style={s.metaValue}>{order.lineItems.length}</Text>
            </View>
            <View style={s.metaCellR}>
              <Text style={s.metaLabel}>Invoice ref.</Text>
              <Text style={s.metaValue}>{order.invoiceNumber ?? 'Pending'}</Text>
            </View>
            <View style={s.metaCellR}>
              <Text style={s.metaLabel}> </Text>
              <Text style={s.metaValue}> </Text>
            </View>
          </View>
        </View>

        {/* Deliver to — legal name primary */}
        <View style={s.deliverBlock}>
          <Text style={s.deliverLabel}>Deliver to</Text>
          <Text style={s.legalName}>{displayLegal}</Text>
          {displayTrading ? <Text style={s.tradingName}>({displayTrading})</Text> : null}
          {address?.line1   ? <Text style={s.tradingName}>{address.line1}</Text>   : null}
          {address?.line2   ? <Text style={s.tradingName}>{address.line2}</Text>   : null}
          {(address?.city || address?.postcode) ? (
            <Text style={s.tradingName}>{[address.city, address.postcode].filter(Boolean).join('  ')}</Text>
          ) : null}
        </View>

        {/* Products table */}
        <Text style={s.tableLabel}>Products</Text>
        <View style={s.thRow}>
          <Text style={[s.thText, s.colCode]}>Product code</Text>
          <Text style={[s.thText, s.colName]}>Product name</Text>
          <Text style={[s.thText, s.colQty]}>Qty (L)</Text>
        </View>
        {order.lineItems.map((item, i) => (
          <View style={s.tdRow} key={i}>
            <Text style={s.tdCode}>{item.productCode}</Text>
            <Text style={s.tdName}>{item.productName}</Text>
            <Text style={s.tdQty}>{item.quantity}</Text>
          </View>
        ))}
        <View style={s.totRow}>
          <Text style={s.totLabel}>Total</Text>
          <Text style={s.totVal}>{totalUnits}</Text>
        </View>

        {/* Signatures — vertical stack, 2 per row */}
        <View style={s.sigSection}>
          <Text style={s.sigSectionLabel}>Confirmation of receipt</Text>

          <View style={s.sigRow}>
            <View style={s.sigBox}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>No. of boxes packed</Text>
              <Text style={s.sigSub}>Completed by Foodlab driver</Text>
            </View>
            <View style={s.sigBox}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Packed by</Text>
              <Text style={s.sigSub}>Foodlab team member name</Text>
            </View>
          </View>

          <View style={s.sigRow}>
            <View style={s.sigBox}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Received by (print name)</Text>
              <Text style={s.sigSub}>{displayLegal} representative</Text>
            </View>
            <View style={s.sigBox}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Signature + date</Text>
              <Text style={s.sigSub}>By signing you confirm receipt of all items listed</Text>
            </View>
          </View>
        </View>

        {order.notes && (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Notes</Text>
            <Text style={s.notesText}>{order.notes}</Text>
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>{supplierName} · Confidential</Text>
          <Text style={s.footerText}>{noteNumber}</Text>
        </View>
      </Page>
    </Document>
  )
}

export default DeliveryNotePDF