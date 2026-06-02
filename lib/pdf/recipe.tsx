import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { Recipe } from '@/types'

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', padding: '40 48 48 48' },
  header:      { marginBottom: 24, borderBottom: '2 solid #111827', paddingBottom: 12 },
  title:       { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4, letterSpacing: -0.3 },
  subtitle:    { fontSize: 10, color: '#6b7280' },
  section:     { marginBottom: 16 },
  sectionTitle:{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  tableHeader: { flexDirection: 'row', background: '#f9fafb', padding: '6 10', borderBottom: '1 solid #e5e7eb' },
  tableRow:    { flexDirection: 'row', padding: '6 10', borderBottom: '1 solid #f9fafb' },
  colName:     { flex: 3 },
  colQty1000:  { flex: 1.5, textAlign: 'right' },
  colQtyScale: { flex: 1.5, textAlign: 'right' },
  thText:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  tdText:      { fontSize: 9, color: '#374151' },
  tdBold:      { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  analyticalRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  analyticalBox: { flex: 1, background: '#f9fafb', padding: '6 10', borderRadius: 4 },
  analyticalLabel: { fontSize: 8, color: '#9ca3af', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  instructions: { fontSize: 10, color: '#374151', lineHeight: 1.7 },
  footer:      { position: 'absolute', bottom: 32, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #e5e7eb', paddingTop: 8 },
  footerText:  { fontSize: 8, color: '#9ca3af' },
})

interface Props { recipe: Recipe; litres?: number }

export function RecipePDF({ recipe, litres = 1000 }: Props) {
  const scale = litres / 1000

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 4, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8 }}>FOODLAB COCKTAILS — CONFIDENTIAL</Text>
          <Text style={s.title}>{recipe.name}</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {recipe.variation    && <Text style={s.subtitle}>{recipe.variation}</Text>}
            {recipe.version      && <Text style={s.subtitle}>Version {recipe.version}</Text>}
            {recipe.createdBy    && <Text style={s.subtitle}>By {recipe.createdBy}</Text>}
            {recipe.dateCreated  && <Text style={s.subtitle}>{recipe.dateCreated}</Text>}
          </View>
          {recipe.productCode && (
            <Text style={{ fontSize: 9, color: '#1d4ed8', marginTop: 4 }}>{recipe.productCode} — {recipe.productName}</Text>
          )}
        </View>

        {/* Scale note */}
        {litres !== 1000 && (
          <View style={{ background: '#eff6ff', padding: '6 10', borderRadius: 4, marginBottom: 12 }}>
            <Text style={{ fontSize: 9, color: '#1d4ed8', fontFamily: 'Helvetica-Bold' }}>Quantities scaled to {litres}L (base: 1000L)</Text>
          </View>
        )}

        {/* Ingredients */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Ingredients</Text>
          <View style={{ border: '1 solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
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
                    {ing.supplier && <Text style={{ fontSize: 8, color: '#9ca3af' }}>{ing.supplier}</Text>}
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {recipe.analyticalValues.map((av, i) => (
                <View key={i} style={[s.analyticalBox, { minWidth: 100 }]}>
                  <Text style={s.analyticalLabel}>{av.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {av.min    != null && <Text style={{ fontSize: 9, color: '#6b7280' }}>Min: <Text style={{ color: '#111827', fontFamily: 'Helvetica-Bold' }}>{av.min}</Text></Text>}
                    {av.target != null && <Text style={{ fontSize: 9, color: '#6b7280' }}>Target: <Text style={{ color: '#111827', fontFamily: 'Helvetica-Bold' }}>{av.target}</Text></Text>}
                    {av.max    != null && <Text style={{ fontSize: 9, color: '#6b7280' }}>Max: <Text style={{ color: '#111827', fontFamily: 'Helvetica-Bold' }}>{av.max}</Text></Text>}
                  </View>
                  {av.notes && <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{av.notes}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Cooking instructions */}
        {recipe.cookingInstructions && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Cooking instructions</Text>
            <Text style={s.instructions}>{recipe.cookingInstructions}</Text>
          </View>
        )}

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