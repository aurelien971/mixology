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
  qtyPerL:      false,
  pricePerUnit: true,
  pricePerL:    false,
  rrp:          true,
  gpPercent:    true,
}

// A4 = 595pt. Padding 36pt each side → 523pt usable.
// Base fixed cols: Code=72, Name=flex. Optional cols are additive.
// Each optional col width:
const W = { serveML: 54, qtyPerL: 46, pricePerUnit: 68, pricePerL: 62, rrp: 52, gpPercent: 52 }

const C = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 9, paddingTop: 40, paddingBottom: 40, paddingLeft: 36, paddingRight: 36, color: '#1a1a1a' },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  brand:      { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111' },
  brandSub:   { fontSize: 8.5, color: '#999', marginTop: 3 },
  docTitle:   { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta:    { fontSize: 8.5, color: '#999', textAlign: 'right', marginTop: 4 },
  divider:    { borderBottomWidth: 0.5, borderBottomColor: '#ddd', marginBottom: 18 },
  clientLabel:{ fontSize: 7.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  clientName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111' },
  clientSub:  { fontSize: 8.5, color: '#999', marginTop: 2 },
  clientBlock:{ marginBottom: 22 },
  venueRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 10 },
  venueName:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', marginRight: 8 },
  venueLine:  { flex: 1, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  thRow:      { flexDirection: 'row', backgroundColor: '#f4f4f4', paddingVertical: 8, paddingHorizontal: 10, marginBottom: 2 },
  thText:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 },
  tdRow:      { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', minHeight: 28 },
  tdRowAlt:   { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', backgroundColor: '#fafafa', minHeight: 28 },
  cCode:      { width: 72, paddingRight: 8 },
  cName:      { flex: 1, paddingRight: 10 },
  codeVal:    { fontSize: 8,    color: '#aaa' },
  nameVal:    { fontSize: 9.5,  color: '#111', fontFamily: 'Helvetica-Bold' },
  numVal:     { fontSize: 9.5,  color: '#444' },
  priceVal:   { fontSize: 9.5,  color: '#111', fontFamily: 'Helvetica-Bold' },
  gpGood:     { fontSize: 9.5,  color: '#166534', fontFamily: 'Helvetica-Bold' },
  gpOk:       { fontSize: 9.5,  color: '#854d0e', fontFamily: 'Helvetica-Bold' },
  totRow:     { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f0f0f0', borderTopWidth: 0.5, borderTopColor: '#ddd', marginBottom: 6 },
  totLabel:   { flex: 1, fontSize: 8.5, color: '#666', fontFamily: 'Helvetica-Bold', textAlign: 'right', paddingRight: 8 },
  totGp:      { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#111' },
  footer:     { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e5e5e5', paddingTop: 5 },
  footerText: { fontSize: 7.5, color: '#bbb' },
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
      {cols.pricePerUnit && <Text style={[C.thText, col(W.pricePerUnit)]}>Price / bag</Text>}
      {cols.pricePerL    && <Text style={[C.thText, col(W.pricePerL)]}>Price / L</Text>}
      {cols.rrp          && <Text style={[C.thText, col(W.rrp)]}>RRP</Text>}
      {cols.gpPercent    && <Text style={[C.thText, { width: W.gpPercent, textAlign: 'right' as const }]}>GP%</Text>}
    </View>
  )
}

function calcVenueGp(rrp: number, pricePerUnit: number, volumeLitres: number, servingG: number): number {
  if (!rrp || !pricePerUnit || !servingG) return 0
  const servingsPerBag  = (volumeLitres * 1000) / servingG
  const bagRevenueExVat = (rrp / 1.2) * servingsPerBag
  return Math.round(((bagRevenueExVat - pricePerUnit) / bagRevenueExVat) * 10000) / 100
}

function PricingRows({ rows, cols }: { rows: AccountPricing[]; cols: PriceListColumns }) {
  const rowsWithGp = rows.map(r => ({
    ...r,
    _gp: calcVenueGp(r.rrp, r.pricePerUnit, r.volumeLitres ?? 5, r.recommendedServingG),
    _ppl: (r.volumeLitres ?? 5) > 0 ? Math.round((r.pricePerUnit / (r.volumeLitres ?? 5)) * 100) / 100 : 0,
  }))
  const avgGp = rowsWithGp.length > 0
    ? rowsWithGp.reduce((s, r) => s + r._gp, 0) / rowsWithGp.length
    : 0

  return (
    <>
      {rowsWithGp.map((item, i) => {
        const vol     = item.volumeLitres ?? 5
        const qtyPerL = item.recommendedServingG > 0
          ? (1000 / item.recommendedServingG).toFixed(1)
          : '—'
        const gpStyle = item._gp >= 75 ? C.gpGood : C.gpOk
        const displayName = `${item.productName} (${vol}L)`

        return (
          <View style={i % 2 === 0 ? C.tdRow : C.tdRowAlt} key={item.id}>
            <Text style={[C.codeVal, C.cCode]}>{item.productCode}</Text>
            <Text style={[C.nameVal, C.cName]}>{displayName}</Text>
            {cols.serveML      && <Text style={[C.numVal,   col(W.serveML)]}>{item.recommendedServingG}</Text>}
            {cols.qtyPerL      && <Text style={[C.numVal,   col(W.qtyPerL)]}>{qtyPerL}</Text>}
            {cols.pricePerUnit && <Text style={[C.priceVal, col(W.pricePerUnit)]}>£{item.pricePerUnit.toFixed(2)}</Text>}
            {cols.pricePerL    && <Text style={[C.priceVal, col(W.pricePerL)]}>{item._ppl > 0 ? `£${item._ppl.toFixed(2)}` : '—'}</Text>}
            {cols.rrp          && <Text style={[C.numVal,   col(W.rrp)]}>£{item.rrp.toFixed(2)}</Text>}
            {cols.gpPercent    && <Text style={[gpStyle,    { width: W.gpPercent, textAlign: 'right' as const }]}>{item._gp.toFixed(1)}%</Text>}
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
              <View key={venueName}>
                <View style={C.venueRow} minPresenceAhead={60}>
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