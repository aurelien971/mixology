import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { AccountPricing } from '@/types'
import { format } from 'date-fns'

export interface PriceListColumns {
  serveML:      boolean
  qtyPerL:      boolean
  pricePerUnit: boolean
  pricePerL:    boolean
  rrp:          boolean
  gpPercent:    boolean
}

export const DEFAULT_COLUMNS: PriceListColumns = {
  serveML:      true,
  qtyPerL:      true,
  pricePerUnit: true,
  pricePerL:    true,
  rrp:          true,
  gpPercent:    true,
}

// A4 = 595pt. Padding 40pt each side → 515pt usable.
// Base fixed cols: Code=68, Name=flex. Optional cols are additive.
// Each optional col width:
const W = { serveML: 48, qtyPerL: 40, pricePerUnit: 58, pricePerL: 52, rrp: 44, gpPercent: 38 }

const C = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 9, paddingTop: 36, paddingBottom: 36, paddingLeft: 40, paddingRight: 40, color: '#1a1a1a' },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  brand:      { fontSize: 17, fontFamily: 'Helvetica-Bold', color: '#111' },
  brandSub:   { fontSize: 8, color: '#999', marginTop: 2 },
  docTitle:   { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta:    { fontSize: 8, color: '#999', textAlign: 'right', marginTop: 3 },
  divider:    { borderBottomWidth: 0.5, borderBottomColor: '#ddd', marginBottom: 16 },
  clientLabel:{ fontSize: 7, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  clientName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111' },
  clientSub:  { fontSize: 8, color: '#999', marginTop: 2 },
  clientBlock:{ marginBottom: 20 },
  venueRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 6 },
  venueName:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111', marginRight: 8 },
  venueLine:  { flex: 1, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  thRow:      { flexDirection: 'row', backgroundColor: '#f4f4f4', paddingVertical: 6, paddingHorizontal: 10, marginBottom: 0 },
  thText:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 },
  tdRow:      { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  tdRowAlt:   { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', backgroundColor: '#fafafa' },
  cCode:      { width: 68, paddingRight: 6 },
  cName:      { flex: 1,   paddingRight: 6 },
  codeVal:    { fontSize: 8,  color: '#aaa' },
  nameVal:    { fontSize: 9,  color: '#111', fontFamily: 'Helvetica-Bold' },
  numVal:     { fontSize: 9,  color: '#444' },
  priceVal:   { fontSize: 9,  color: '#111', fontFamily: 'Helvetica-Bold' },
  gpGood:     { fontSize: 9,  color: '#166534', fontFamily: 'Helvetica-Bold' },
  gpOk:       { fontSize: 9,  color: '#854d0e', fontFamily: 'Helvetica-Bold' },
  totRow:     { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f0f0f0', borderTopWidth: 0.5, borderTopColor: '#ddd', marginBottom: 4 },
  totLabel:   { flex: 1, fontSize: 8, color: '#666', fontFamily: 'Helvetica-Bold', textAlign: 'right', paddingRight: 6 },
  totGp:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111' },
  footer:     { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e5e5e5', paddingTop: 5 },
  footerText: { fontSize: 7, color: '#bbb' },
})

function col(width: number, extra?: object) {
  return { width, paddingRight: 6, textAlign: 'right' as const, ...extra }
}

function TableHeader({ cols }: { cols: PriceListColumns }) {
  return (
    <View style={C.thRow}>
      <Text style={[C.thText, C.cCode]}>Code</Text>
      <Text style={[C.thText, C.cName]}>Cocktail</Text>
      {cols.serveML      && <Text style={[C.thText, col(W.serveML)]}>Serve ml</Text>}
      {cols.qtyPerL      && <Text style={[C.thText, col(W.qtyPerL)]}>Qty/L</Text>}
      {cols.pricePerUnit && <Text style={[C.thText, col(W.pricePerUnit)]}>Price/unit</Text>}
      {cols.pricePerL    && <Text style={[C.thText, col(W.pricePerL)]}>Price/L</Text>}
      {cols.rrp          && <Text style={[C.thText, col(W.rrp)]}>RRP</Text>}
      {cols.gpPercent    && <Text style={[C.thText, { width: W.gpPercent, textAlign: 'right' as const }]}>GP% ex-VAT</Text>}
    </View>
  )
}

function PricingRows({ rows, cols }: { rows: AccountPricing[]; cols: PriceListColumns }) {
  const avgGp = rows.length > 0
    ? rows.reduce((s, r) => s + r.venueGpPercent, 0) / rows.length
    : 0

  return (
    <>
      {rows.map((item, i) => {
        const qtyPerL = item.recommendedServingG > 0
          ? (1000 / item.recommendedServingG).toFixed(1)
          : '—'
        const priceL = item.pricePerLitre > 0
          ? item.pricePerLitre
          : item.recommendedServingG > 0
            ? Math.round((item.pricePerUnit / item.recommendedServingG) * 1000 * 100) / 100
            : 0
        const gpStyle = item.venueGpPercent >= 75 ? C.gpGood : C.gpOk

        return (
          <View style={i % 2 === 0 ? C.tdRow : C.tdRowAlt} key={item.id}>
            <Text style={[C.codeVal, C.cCode]}>{item.productCode}</Text>
            <Text style={[C.nameVal, C.cName]}>{item.productName}</Text>
            {cols.serveML      && <Text style={[C.numVal,   col(W.serveML)]}>{item.recommendedServingG}</Text>}
            {cols.qtyPerL      && <Text style={[C.numVal,   col(W.qtyPerL)]}>{qtyPerL}</Text>}
            {cols.pricePerUnit && <Text style={[C.priceVal, col(W.pricePerUnit)]}>£{item.pricePerUnit.toFixed(2)}</Text>}
            {cols.pricePerL    && <Text style={[C.priceVal, col(W.pricePerL)]}>{priceL > 0 ? `£${priceL.toFixed(2)}` : '—'}</Text>}
            {cols.rrp          && <Text style={[C.numVal,   col(W.rrp)]}>£{item.rrp.toFixed(2)}</Text>}
            {cols.gpPercent    && <Text style={[gpStyle,    { width: W.gpPercent, textAlign: 'right' as const }]}>{item.venueGpPercent.toFixed(1)}%</Text>}
          </View>
        )
      })}
      <View style={C.totRow}>
        <Text style={C.totLabel}>Total — {rows.length} product{rows.length !== 1 ? 's' : ''}</Text>
        {cols.gpPercent
          ? <Text style={[C.totGp, { width: W.gpPercent, textAlign: 'right' as const }]}>{avgGp.toFixed(1)}%</Text>
          : null
        }
      </View>
    </>
  )
}

export interface PriceListPDFProps {
  account?: { tradingName: string; legalName: string }
  pricing?: AccountPricing[]
  groupName?: string
  groupPricing?: AccountPricing[]
  accountLegalNames?: Record<string, string>
  columns?: PriceListColumns
  supplierName?: string
  supplierAddress?: string
}

export function PriceListPDF({
  account,
  pricing = [],
  groupName,
  groupPricing = [],
  accountLegalNames = {},
  columns = DEFAULT_COLUMNS,
  supplierName = 'Foodlab Cocktails',
  supplierAddress = 'London, UK',
}: PriceListPDFProps) {
  const today    = format(new Date(), 'd MMMM yyyy')
  const isGroup  = !!groupName
  const clientLabel = isGroup ? groupName! : account?.tradingName ?? ''
  const clientSub   = isGroup ? 'Group price list' : (account?.legalName ?? '')

  const venueMap: Record<string, AccountPricing[]> = {}
  if (isGroup) {
    for (const row of groupPricing) {
      if (!venueMap[row.accountName]) venueMap[row.accountName] = []
      venueMap[row.accountName].push(row)
    }
  }

  return (
    <Document>
      <Page size="A4" style={C.page}>
        <View style={C.headerRow}>
          <View>
            <Text style={C.brand}>{supplierName}</Text>
            <Text style={C.brandSub}>{supplierAddress}</Text>
          </View>
          <View>
            <Text style={C.docTitle}>Price List</Text>
            <Text style={C.docMeta}>Issued: {today}</Text>
          </View>
        </View>

        <View style={C.divider} />

        <View style={C.clientBlock}>
          <Text style={C.clientLabel}>Prepared for</Text>
          <Text style={C.clientName}>{clientLabel}</Text>
          <Text style={C.clientSub}>{clientSub}</Text>
        </View>

        {isGroup ? (
          Object.entries(venueMap).map(([venueName, rows]) => {
            const legalName = accountLegalNames[venueName]
            return (
              <View key={venueName} wrap={false}>
                <View style={C.venueRow}>
                  <Text style={C.venueName}>
                    {venueName}{legalName ? ` (${legalName})` : ''}
                  </Text>
                  <View style={C.venueLine} />
                </View>
                <TableHeader cols={columns} />
                <PricingRows rows={rows} cols={columns} />
              </View>
            )
          })
        ) : (
          <>
            <TableHeader cols={columns} />
            <PricingRows rows={pricing} cols={columns} />
          </>
        )}

        <View style={C.footer} fixed>
          <Text style={C.footerText}>{supplierName} — Confidential. Not for redistribution.</Text>
          <Text style={C.footerText}>{today}</Text>
        </View>
      </Page>
    </Document>
  )
}