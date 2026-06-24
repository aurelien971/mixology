import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { Recipe } from '@/types'

const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', paddingTop: 40, paddingBottom: 48, paddingLeft: 48, paddingRight: 48 },
  header:       { marginBottom: 24, borderBottomWidth: 2, borderBottomColor: '#111827', borderBottomStyle: 'solid', paddingBottom: 12 },
  title:        { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  subtitle:     { fontSize: 10, color: '#6b7280' },
  meta:         { flexDirection: 'row', marginTop: 2 },
  metaItem:     { fontSize: 10, color: '#6b7280', marginRight: 16 },
  section:      { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 8, textTransform: 'uppercase' },
  tableHeader:  { flexDirection: 'row', backgroundColor: '#f9fafb', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', borderBottomStyle: 'solid' },
  tableRow:     { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb', borderBottomStyle: 'solid' },
  colName:      { flex: 3 },
  colQty1000:   { flex: 1.5, textAlign: 'right' },
  colQtyScale:  { flex: 1.5, textAlign: 'right' },
  thText:       { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase' },
  tdText:       { fontSize: 9, color: '#374151' },
  tdBold:       { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  analyticalBox: { flex: 1, backgroundColor: '#f9fafb', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4, marginRight: 6 },
  analyticalLabel: { fontSize: 8, color: '#9ca3af', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  analyticalRow: { flexDirection: 'row', marginBottom: 6 },
  instructions: { fontSize: 10, color: '#374151', lineHeight: 1.7 },
  scaleBanner:  { backgroundColor: '#eff6ff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4, marginBottom: 12 },
  footer:       { position: 'absolute', bottom: 32, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', borderTopStyle: 'solid', paddingTop: 8 },
  footerText:   { fontSize: 8, color: '#9ca3af' },
  border:       { borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'solid', borderRadius: 4, overflow: 'hidden' },
})

interface Props { recipe: Recipe; litres?: number }

export function RecipePDF({ recipe, litres = 1000 }: Props) {
  const scale = litres / 1000

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 4, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' }}>
            FOODLAB COCKTAILS — CONFIDENTIAL
          </Text>
          <Text style={s.title}>{recipe.name}</Text>
          <View style={s.meta}>
            {recipe.variation   && <Text style={s.metaItem}>{recipe.variation}</Text>}
            {recipe.version     && <Text style={s.metaItem}>Version {recipe.version}</Text>}
            {recipe.createdBy   && <Text style={s.metaItem}>By {recipe.createdBy}</Text>}
            {recipe.dateCreated && <Text style={s.metaItem}>{recipe.dateCreated}</Text>}
          </View>
          {recipe.productCode && (
            <Text style={{ fontSize: 9, color: '#1d4ed8', marginTop: 4 }}>
              {recipe.productCode} — {recipe.productName}
            </Text>
          )}
        </View>

        {/* Scale banner */}
        {litres !== 1000 && (
          <View style={s.scaleBanner}>
            <Text style={{ fontSize: 9, color: '#1d4ed8', fontFamily: 'Helvetica-Bold' }}>
              Quantities scaled to {litres}L (base: 1000L)
            </Text>
          </View>
        )}

        {/* Ingredients */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Ingredients</Text>
          <View style={s.border}>
            <View style={s.tableHeader}>
              <Text style={[s.thText, s.colName]}>Ingredient</Text>
              <Text style={[s.thText, s.colQty1000]}>Per 1000L (KG)</Text>
              <Text style={[s.thText, s.colQtyScale]}>For {litres}L (KG)</Text>
            </View>
            {recipe.ingredients.map((ing, i) => {
              const qty = Math.round(ing.qtyPer1000L * scale * 1000) / 1000
              return (
                <View style={s.tableRow} key={i}>
                  <View style={s.colName}>
                    <Text style={s.tdBold}>{ing.name}</Text>
                    {ing.supplier ? <Text style={{ fontSize: 8, color: '#9ca3af' }}>{ing.supplier}</Text> : null}
                  </View>
                  <Text style={[s.tdText, s.colQty1000]}>{ing.qtyPer1000L}</Text>
                  <Text style={[s.tdBold, s.colQtyScale]}>{qty}</Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Analytical values */}
        {recipe.analyticalValues.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Analytical values</Text>
            <View style={s.analyticalRow}>
              {recipe.analyticalValues.map((av, i) => (
                <View key={i} style={s.analyticalBox}>
                  <Text style={s.analyticalLabel}>{av.name}</Text>
                  <View style={{ flexDirection: 'row' }}>
                    {av.min    != null && <Text style={{ fontSize: 9, color: '#6b7280', marginRight: 8 }}>Min: <Text style={{ color: '#111827', fontFamily: 'Helvetica-Bold' }}>{av.min}</Text></Text>}
                    {av.target != null && <Text style={{ fontSize: 9, color: '#6b7280', marginRight: 8 }}>Target: <Text style={{ color: '#111827', fontFamily: 'Helvetica-Bold' }}>{av.target}</Text></Text>}
                    {av.max    != null && <Text style={{ fontSize: 9, color: '#6b7280' }}>Max: <Text style={{ color: '#111827', fontFamily: 'Helvetica-Bold' }}>{av.max}</Text></Text>}
                  </View>
                  {av.notes ? <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{av.notes}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Cooking instructions */}
        {recipe.cookingInstructions ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Cooking instructions</Text>
            <Text style={s.instructions}>{recipe.cookingInstructions}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Foodlab Cocktails — Confidential. Not for redistribution.</Text>
          <Text style={s.footerText}>{recipe.name} · v{recipe.version ?? '1.0'}</Text>
        </View>

      </Page>
    </Document>
  )
}

export default RecipePDF