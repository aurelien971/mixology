'use client'

import { useEffect, useMemo, useState } from 'react'
import { Recipe, RecipeIngredient, RecipeAnalytical, Product, Ingredient, PackUnit, IngredientFormat, Currency, RecipeUnit, INGREDIENT_FORMATS, CURRENCY_SYMBOLS } from '@/types'
import { createRecipe, updateRecipe } from '@/lib/firestore/recipes'
import { getIngredients, createIngredient, updateIngredient, normalizeIngredientName, normalizeSupplier } from '@/lib/firestore/ingredients'
import { syncProductCostForRecipe } from '@/lib/recipeSync'
import Button from '@/components/ui/Button'
import ScreenshotImport from '@/components/recipes/ScreenshotImport'
import ProcessEditor from '@/components/recipes/ProcessEditor'
import { toBaseAmount } from '@/lib/costing'
import toast from 'react-hot-toast'

function r4(n: number) { return Math.round(n * 10000) / 10000 }


interface NewPack {
  supplier: string
  format: IngredientFormat
  formatOther: string
  packSize: string
  packUnit: PackUnit
  packPrice: string
  currency: Currency
}

interface Row {
  name: string
  ingredientId?: string
  amount: string                // quantity for THIS batch, in `unit`
  unit: RecipeUnit
  newPack?: NewPack
}

interface AnalyticalRow { name: string; min: string; target: string; max: string; notes: string }

function unitFromStored(u: string): RecipeUnit {
  if (u === 'L') return 'L'
  if (u === 'UNIT' || u === 'unit') return 'unit'
  return 'kg'
}

export interface RecipeDraft {
  name: string
  variation?: string
  version?: string
  createdBy?: string
  dateCreated?: string
  productId?: string
  ingredients: RecipeIngredient[]
  analyticalValues: RecipeAnalytical[]
  cookingInstructions: string
  approxTimeMinutes?: number
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }

export default function RecipeEditor({
  existing, draft, products, presetProductId, onSaved, onClose,
}: {
  existing?: Recipe
  draft?: RecipeDraft
  products: Product[]
  presetProductId?: string
  onSaved: () => void
  onClose: () => void
}) {
  const src = existing ?? draft
  const hasStoredIngredients = (src?.ingredients?.length ?? 0) > 0

  const [name, setName]           = useState(src?.name ?? '')
  const [variation, setVariation] = useState(src?.variation ?? '')
  const [createdBy, setCreatedBy] = useState(src?.createdBy ?? '')
  const [productId, setProductId] = useState(existing?.productId ?? draft?.productId ?? presetProductId ?? '')
  const [instructions, setInstructions] = useState(src?.cookingInstructions ?? '')
  // Batch volume: stored data is per 1000L, so existing/parsed recipes load as a 1000L batch.
  // Fresh manual recipes default to a realistic 10L batch — Dima types what he actually makes.
  const [batchLitres, setBatchLitres] = useState(hasStoredIngredients ? '1000' : '10')
  const [rows, setRows] = useState<Row[]>(
    (src?.ingredients ?? []).map(i => ({
      name: i.name,
      ingredientId: i.ingredientId,
      amount: String(i.qtyPer1000L),
      unit: unitFromStored(i.unit),
    }))
  )
  const [analytical, setAnalytical] = useState<AnalyticalRow[]>(
    (src?.analyticalValues ?? []).map(a => ({
      name: a.name, min: a.min != null ? String(a.min) : '', target: a.target != null ? String(a.target) : '',
      max: a.max != null ? String(a.max) : '', notes: a.notes ?? '',
    }))
  )
  const [library, setLibrary] = useState<Ingredient[]>([])
  const [saving, setSaving]   = useState(false)
  const [savingIngIdx, setSavingIngIdx] = useState<number | null>(null)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const [activeSuggest, setActiveSuggest] = useState<number | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [processForRow, setProcessForRow] = useState<{ index: number; presetName: string } | null>(null)
  const [approxTime, setApproxTime] = useState(src?.approxTimeMinutes != null ? String(src.approxTimeMinutes) : '')

  useEffect(() => { getIngredients().then(setLibrary) }, [])

  const knownSuppliers = useMemo(
    () => [...new Set(library.map(i => i.supplier).filter((s): s is string => !!s))].sort(),
    [library]
  )

  // Auto-link rows whose typed name matches the library
  useEffect(() => {
    setRows(prev => prev.map(row => {
      if (row.ingredientId) return row
      const match = library.find(i => i.nameKey === normalizeIngredientName(row.name))
      return match ? { ...row, ingredientId: match.id, name: match.name, newPack: undefined } : row
    }))
  }, [library])

  function setRow(i: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function pickSuggestion(i: number, ing: Ingredient) {
    setRow(i, { name: ing.name, ingredientId: ing.id, newPack: undefined })
    setActiveSuggest(null)
  }

  function markAsNew(i: number) {
    setRow(i, {
      ingredientId: undefined,
      newPack: { supplier: '', format: 'bottle', formatOther: '', packSize: '', packUnit: 'kg', packPrice: '', currency: 'GBP' },
    })
    setActiveSuggest(null)
  }

  const suggestionsFor = (row: Row) => {
    const q = normalizeIngredientName(row.name)
    if (!q) return []
    return library.filter(i => i.nameKey.includes(q)).slice(0, 6)
  }

  // Save a new ingredient to the library immediately, without saving the whole recipe
  async function saveNewIngredient(i: number) {
    const row = rows[i]
    const np = row.newPack
    if (!np || !row.name.trim()) return
    if (!parseFloat(np.packSize) || np.packPrice === '' || !np.supplier.trim() || (np.format === 'other' && !np.formatOther.trim())) {
      toast.error('Fill in format, volume, price and supplier first')
      return
    }
    setSavingIngIdx(i)
    try {
      const formatLabel = np.format === 'other' ? np.formatOther.trim() : np.format
      const id = await createIngredient({
        name: row.name,
        supplier: np.supplier ? normalizeSupplier(np.supplier, knownSuppliers) : undefined,
        format: np.format,
        currency: np.currency,
        packDescription: `${parseFloat(np.packSize)}${np.packUnit} ${formatLabel}`,
        packSize: parseFloat(np.packSize),
        packUnit: np.packUnit,
        packPrice: parseFloat(np.packPrice) || 0,
      })
      setLibrary(await getIngredients())
      setRow(i, { ingredientId: id, newPack: undefined })
      toast.success(`“${row.name.trim()}” saved to your ingredients`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to save ingredient')
    } finally {
      setSavingIngIdx(null)
    }
  }

  // Inline fix: a matched library ingredient has no price — set it right here
  async function savePriceFor(ing: Ingredient) {
    const raw = priceInputs[ing.id]
    const price = parseFloat(raw)
    if (!(price > 0)) { toast.error('Enter the price you pay per ' + ing.packDescription); return }
    setSavingPriceId(ing.id)
    try {
      await updateIngredient(ing.id, { packPrice: price })
      setLibrary(await getIngredients())
      setPriceInputs(prev => { const n = { ...prev }; delete n[ing.id]; return n })
      toast.success(`${ing.name}: £${price.toFixed(2)} per ${ing.packDescription} saved`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to save price')
    } finally {
      setSavingPriceId(null)
    }
  }

  // Fill this recipe's form from a parsed screenshot. Unmatched ingredients get their
  // "new ingredient" form opened automatically — the recipe can't be saved until each
  // one has format, volume, price AND supplier.
  function applyParsedDraft(d: RecipeDraft) {
    if (d.name) setName(d.name)
    if (d.variation) setVariation(d.variation)
    if (d.createdBy) setCreatedBy(d.createdBy)
    if (d.cookingInstructions) setInstructions(d.cookingInstructions)
    if (d.analyticalValues.length) {
      setAnalytical(d.analyticalValues.map(a => ({
        name: a.name, min: a.min != null ? String(a.min) : '', target: a.target != null ? String(a.target) : '',
        max: a.max != null ? String(a.max) : '', notes: a.notes ?? '',
      })))
    }
    setBatchLitres('1000')  // parsed sheets are per 1000L
    let unmatched = 0
    setRows(d.ingredients.map(ing => {
      const match = library.find(l => l.nameKey === normalizeIngredientName(ing.name))
      if (match) {
        return { name: match.name, ingredientId: match.id, amount: String(ing.qtyPer1000L), unit: unitFromStored(ing.unit) }
      }
      unmatched++
      return {
        name: ing.name, amount: String(ing.qtyPer1000L), unit: unitFromStored(ing.unit),
        newPack: { supplier: '', format: 'bottle' as IngredientFormat, formatOther: '', packSize: '', packUnit: 'kg' as PackUnit, packPrice: '', currency: 'GBP' as Currency },
      }
    }))
    if (unmatched > 0) {
      toast(`${unmatched} new ingredient${unmatched !== 1 ? 's' : ''} — fill in how you order each one before saving`, { icon: '🧾', duration: 5000 })
    } else {
      toast.success('Screenshot applied — all ingredients recognised')
    }
  }

  const unresolved = rows.filter(r => r.name.trim() && !r.ingredientId && !r.newPack)
  const unpriced = rows.filter(r => {
    if (!r.ingredientId) return false
    const ing = library.find(l => l.id === r.ingredientId)
    return !!ing && !(ing.packPrice > 0)
  })
  const incompleteNew = rows.filter(r => r.newPack && (!parseFloat(r.newPack.packSize) || r.newPack.packPrice === '' || !r.newPack.supplier.trim() || (r.newPack.format === 'other' && !r.newPack.formatOther.trim())))

  const batch = parseFloat(batchLitres) || 0

  // Live cost preview — per litre of finished product
  const costPreview = useMemo(() => {
    if (batch <= 0) return { costPerLitre: 0, complete: false }
    let total = 0; let complete = true
    for (const r of rows) {
      const amount = parseFloat(r.amount)
      if (!r.name.trim() || !amount) continue
      const { value } = toBaseAmount(amount, r.unit)
      const perLitre = value / batch
      const ing = r.ingredientId ? library.find(i => i.id === r.ingredientId) : undefined
      if (ing && ing.packPrice > 0 && ing.packSize > 0) {
        total += perLitre * ing.pricePerUnit
      } else if (r.newPack && parseFloat(r.newPack.packSize) > 0 && parseFloat(r.newPack.packPrice) > 0) {
        total += perLitre * (parseFloat(r.newPack.packPrice) / parseFloat(r.newPack.packSize))
      } else {
        complete = false
      }
    }
    return { costPerLitre: r4(total), complete }
  }, [rows, library, batch])

  async function handleSave() {
    if (!name.trim()) { toast.error('Give the recipe a name'); return }
    if (!(batch > 0)) { toast.error('Set the batch volume (litres)'); return }
    const validRows = rows.filter(r => r.name.trim() && parseFloat(r.amount) > 0)
    if (validRows.length === 0) { toast.error('Add at least one ingredient with an amount'); return }
    if (unresolved.length > 0) { toast.error(`Pick or create: ${unresolved.map(r => r.name).join(', ')}`); return }
    if (incompleteNew.length > 0) { toast.error(`Fill in format, volume, price & supplier for: ${incompleteNew.map(r => r.name).join(', ')}`); return }
    if (unpriced.length > 0) { toast.error(`Add the price for: ${unpriced.map(r => r.name).join(', ')}`); return }

    setSaving(true)
    try {
      // 1. Create any new ingredients (with their price) first
      const idByRowIndex = new Map<number, string>()
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (!r.name.trim() || !(parseFloat(r.amount) > 0)) continue
        if (r.ingredientId) { idByRowIndex.set(i, r.ingredientId); continue }
        const np = r.newPack!
        const formatLabel = np.format === 'other' ? np.formatOther.trim() : np.format
        const id = await createIngredient({
          name: r.name,
          supplier: np.supplier ? normalizeSupplier(np.supplier, knownSuppliers) : undefined,
          format: np.format,
          currency: np.currency,
          packDescription: `${parseFloat(np.packSize)}${np.packUnit} ${formatLabel}`,
          packSize: parseFloat(np.packSize),
          packUnit: np.packUnit,
          packPrice: parseFloat(np.packPrice) || 0,
        })
        idByRowIndex.set(i, id)
      }

      // 2. Build recipe payload — normalise batch amounts to per-1L / per-1000L for storage
      const ingredients: RecipeIngredient[] = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.name.trim() && parseFloat(r.amount) > 0)
        .map(({ r, i }) => {
          const { value, base } = toBaseAmount(parseFloat(r.amount), r.unit)
          const per1L = value / batch
          return {
            name: r.name.trim(),
            unit: base,
            qtyPer1000L: r4(per1L * 1000),
            qtyPer1L: r4(per1L),
            ingredientId: idByRowIndex.get(i),
          }
        })

      const analyticalValues: RecipeAnalytical[] = analytical
        .filter(a => a.name.trim())
        .map(a => {
          const row: RecipeAnalytical = { name: a.name.trim() }
          if (a.min !== '') row.min = parseFloat(a.min)
          if (a.target !== '') row.target = parseFloat(a.target)
          if (a.max !== '') row.max = parseFloat(a.max)
          if (a.notes.trim()) row.notes = a.notes.trim()
          return row
        })

      const product = products.find(p => p.id === productId)
      const payload: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> = {
        name: name.trim(),
        ingredients,
        analyticalValues,
        cookingInstructions: instructions,
        status: 'active',
      }
      if (variation.trim()) payload.variation = variation.trim()
      if (approxTime !== '' && parseFloat(approxTime) > 0) payload.approxTimeMinutes = parseFloat(approxTime)
      if (createdBy.trim()) payload.createdBy = createdBy.trim()
      if (existing?.version) payload.version = existing.version
      if (productId) {
        payload.productId = productId
        payload.productCode = product?.productCode
        payload.productName = product?.name
      }

      let recipeId: string
      if (existing) {
        await updateRecipe(existing.id, payload)
        recipeId = existing.id
      } else {
        recipeId = await createRecipe(payload)
      }

      // 3. Push calculated cost into the linked catalog product
      if (productId) {
        const fresh = await getIngredients()
        await syncProductCostForRecipe({ ...payload, id: recipeId, createdAt: new Date(), updatedAt: new Date() } as Recipe, { ingredients: fresh })
      }

      toast.success(existing ? 'Recipe updated' : `Recipe saved${productId ? ' — product cost updated' : ''}`)
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Failed to save recipe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '780px', border: '1px solid #e5e7eb', marginBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{existing ? 'Edit recipe' : 'New recipe'}</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>Enter the batch you actually make — amounts scale automatically for any size</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>📷 Fill from screenshot</Button>
            <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {processForRow && (
          <ProcessEditor
            presetName={processForRow.presetName}
            ingredients={library}
            onClose={() => setProcessForRow(null)}
            onSaved={async id => {
              const fresh = await getIngredients()
              setLibrary(fresh)
              const proc = fresh.find(x => x.id === id)
              setRow(processForRow.index, { ingredientId: id, name: proc?.name ?? processForRow.presetName, newPack: undefined })
            }}
          />
        )}

        {showImport && (
          <ScreenshotImport
            onClose={() => setShowImport(false)}
            onParsed={drafts => {
              setShowImport(false)
              if (!drafts.length) return
              if (drafts.length > 1) toast(`Screenshots contained ${drafts.length} recipes — applied “${drafts[0].name}” to this one`, { icon: 'ℹ️' })
              applyParsedDraft(drafts[0])
            }}
          />
        )}

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Basics */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Recipe name *</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Margarita Pre-Batch" />
            </div>
            <div>
              <label style={labelStyle}>Variation</label>
              <input style={inputStyle} value={variation} onChange={e => setVariation(e.target.value)} placeholder="e.g. Catalina Miami" />
            </div>
            <div>
              <label style={labelStyle}>Created by</label>
              <input style={inputStyle} value={createdBy} onChange={e => setCreatedBy(e.target.value)} placeholder="e.g. Dima" />
            </div>
          </div>

          {/* Product link + batch volume + approx time */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Linked product (drives COGS in catalog & finances)</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">— not linked —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.productCode} · {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Batch volume (litres) *</label>
              <div style={{ position: 'relative' }}>
                <input style={inputStyle} inputMode="decimal" value={batchLitres} onChange={e => setBatchLitres(e.target.value)} placeholder="10" />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9ca3af' }}>L</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Approx. time to cook</label>
              <div style={{ position: 'relative' }}>
                <input style={inputStyle} inputMode="decimal" value={approxTime} onChange={e => setApproxTime(e.target.value)} placeholder="90" />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9ca3af' }}>min</span>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                Ingredients * <span style={{ fontWeight: 400, color: '#9ca3af' }}>— amounts for a {batch > 0 ? batch : '…'}L batch</span>
              </label>
              <span style={{ fontSize: '12px', color: costPreview.complete ? '#166534' : '#92400e', fontWeight: 600 }}>
                {costPreview.complete
                  ? `Cost: £${costPreview.costPerLitre.toFixed(2)} / litre`
                  : 'Cost incomplete — some ingredients need a price'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 100px 78px 32px', gap: '6px', marginBottom: '4px' }}>
              <span />
              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Ingredient</span>
              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Amount</span>
              <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Unit</span>
              <span />
            </div>

            {rows.map((row, i) => {
              const suggestions = suggestionsFor(row)
              const linked = row.ingredientId ? library.find(l => l.id === row.ingredientId) : undefined
              const priced = !!linked && linked.packPrice > 0
              const status: 'ok' | 'price' | 'setup' | 'empty' =
                !row.name.trim() ? 'empty' : priced ? 'ok' : linked ? 'price' : 'setup'
              return (
                <div key={i} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 100px 78px 32px', gap: '6px', alignItems: 'center' }}>
                    <span title={status === 'ok' ? 'Validated — matched & priced' : status === 'price' ? 'Needs a price' : status === 'setup' ? 'Needs setting up' : ''}
                      style={{
                        width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 700,
                        background: status === 'ok' ? '#dcfce7' : status === 'price' ? '#fef3c7' : status === 'setup' ? '#fef3c7' : '#f3f4f6',
                        color: status === 'ok' ? '#166534' : status === 'empty' ? '#d1d5db' : '#92400e',
                      }}>
                      {status === 'ok' ? '✓' : status === 'price' ? '£' : status === 'setup' ? '?' : '·'}
                    </span>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...inputStyle, borderColor: row.name.trim() && !row.ingredientId && !row.newPack ? '#fbbf24' : linked ? '#bbf7d0' : '#e5e7eb' }}
                        value={row.name}
                        placeholder="Start typing — e.g. Citric Acid"
                        onChange={e => { setRow(i, { name: e.target.value, ingredientId: undefined, newPack: undefined }); setActiveSuggest(i) }}
                        onFocus={() => setActiveSuggest(i)}
                        onBlur={() => setTimeout(() => setActiveSuggest(s => s === i ? null : s), 200)}
                      />
                      {linked && (
                        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#166534' }}>
                          {CURRENCY_SYMBOLS[linked.currency ?? 'GBP']}{linked.pricePerUnit.toFixed(2)}/{linked.packUnit}
                        </span>
                      )}
                      {activeSuggest === i && row.name.trim() && !row.ingredientId && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: '2px', overflow: 'hidden' }}>
                          {suggestions.map(s => (
                            <button key={s.id} onMouseDown={() => pickSuggestion(i, s)}
                              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                              <span style={{ fontWeight: 500, color: '#111827' }}>{s.name}</span>
                              <span style={{ color: '#9ca3af', fontSize: '12px' }}>{s.packDescription} · {CURRENCY_SYMBOLS[s.currency ?? 'GBP']}{s.packPrice.toFixed(2)}</span>
                            </button>
                          ))}
                          <button onMouseDown={() => markAsNew(i)}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', borderTop: suggestions.length ? '1px solid #f3f4f6' : 'none', background: '#f0fdf4', cursor: 'pointer', fontSize: '13px', textAlign: 'left', color: '#166534', fontWeight: 600 }}>
                            + New ingredient “{row.name.trim()}”
                          </button>
                          <button onMouseDown={() => { setProcessForRow({ index: i, presetName: row.name.trim() }); setActiveSuggest(null) }}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', borderTop: '1px solid #f3f4f6', background: '#eff6ff', cursor: 'pointer', fontSize: '13px', textAlign: 'left', color: '#1d4ed8', fontWeight: 600 }}>
                            ⚙️ New process “{row.name.trim()}” (made in-house)
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      style={inputStyle} inputMode="decimal" placeholder="0"
                      value={row.amount}
                      onChange={e => setRow(i, { amount: e.target.value })}
                    />
                    <select style={{ ...inputStyle, padding: '9px 6px', cursor: 'pointer' }} value={row.unit}
                      onChange={e => setRow(i, { unit: e.target.value as RecipeUnit })}>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="L">L</option>
                      <option value="unit">unit</option>
                    </select>
                    <button onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                  </div>

                  {/* Linked ingredient with no price — fix it inline, no trip to Stock take */}
                  {linked && !(linked.packPrice > 0) && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: '10px', padding: '8px 12px', margin: '4px 0 2px 32px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#92400e' }}>
                        <strong>{linked.name}</strong> — add the price: what do you pay per {linked.packDescription}?
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>£</span>
                        <input
                          style={{ ...inputStyle, width: '90px', padding: '7px 10px' }}
                          inputMode="decimal" placeholder="0.00" autoFocus={false}
                          value={priceInputs[linked.id] ?? ''}
                          onChange={e => setPriceInputs(prev => ({ ...prev, [linked.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePriceFor(linked) } }}
                        />
                        <Button size="sm" onClick={() => savePriceFor(linked)} loading={savingPriceId === linked.id}>Save price</Button>
                      </div>
                    </div>
                  )}

                  {/* New ingredient — how do you ORDER it from the supplier */}
                  {row.newPack && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e', borderRadius: '10px', padding: '12px 14px', margin: '4px 0 2px 32px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>
                        New ingredient — “{row.name.trim()}”
                      </p>
                      <p style={{ fontSize: '11px', color: '#4b7c5e', margin: '0 0 8px' }}>
                        Tell us how you <strong>order it from the supplier</strong> — this drives costs and stock counting.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 66px 110px 1.2fr', gap: '6px' }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Format *</label>
                          <select style={{ ...inputStyle, padding: '9px 6px', cursor: 'pointer' }} value={row.newPack.format}
                            onChange={e => setRow(i, { newPack: { ...row.newPack!, format: e.target.value as IngredientFormat } })}>
                            {INGREDIENT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                          {row.newPack.format === 'other' && (
                            <input style={{ ...inputStyle, marginTop: '4px' }} value={row.newPack.formatOther} placeholder="e.g. sachet"
                              onChange={e => setRow(i, { newPack: { ...row.newPack!, formatOther: e.target.value } })} />
                          )}
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Volume *</label>
                          <input style={inputStyle} inputMode="decimal" value={row.newPack.packSize} placeholder="0.7"
                            onChange={e => setRow(i, { newPack: { ...row.newPack!, packSize: e.target.value } })} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Unit</label>
                          <select style={{ ...inputStyle, padding: '9px 6px' }} value={row.newPack.packUnit}
                            onChange={e => setRow(i, { newPack: { ...row.newPack!, packUnit: e.target.value as PackUnit } })}>
                            <option value="kg">kg</option>
                            <option value="L">L</option>
                            <option value="unit">units</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Price per unit *</label>
                          <div style={{ display: 'flex', gap: '3px' }}>
                            <select style={{ ...inputStyle, width: '46px', padding: '9px 3px' }} value={row.newPack.currency}
                              onChange={e => setRow(i, { newPack: { ...row.newPack!, currency: e.target.value as Currency } })}>
                              <option value="GBP">£</option>
                              <option value="EUR">€</option>
                              <option value="USD">$</option>
                            </select>
                            <input style={inputStyle} inputMode="decimal" value={row.newPack.packPrice} placeholder="14.50"
                              onChange={e => setRow(i, { newPack: { ...row.newPack!, packPrice: e.target.value } })} />
                          </div>
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Supplier *</label>
                          <input style={inputStyle} value={row.newPack.supplier} placeholder="start typing…" list="supplier-suggestions"
                            onChange={e => setRow(i, { newPack: { ...row.newPack!, supplier: e.target.value } })} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '10px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>
                          e.g. Bottle · 0.7 · L · £14.50 means: you buy it as 0.7-litre bottles at £14.50 each.
                        </p>
                        <Button size="sm" onClick={() => saveNewIngredient(i)} loading={savingIngIdx === i}>
                          Save ingredient
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <datalist id="supplier-suggestions">
              {knownSuppliers.map(s => <option key={s} value={s} />)}
            </datalist>

            <Button variant="secondary" size="sm" onClick={() => setRows(prev => [...prev, { name: '', amount: '', unit: 'g' }])}>
              + Add ingredient
            </Button>
          </div>

          {/* Analytical values */}
          <div>
            <label style={labelStyle}>Analytical values <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional — Brix, pH…)</span></label>
            {analytical.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 70px 70px 70px 1.6fr 32px', gap: '6px', marginBottom: '6px' }}>
                <input style={inputStyle} value={a.name} placeholder="Brix" onChange={e => setAnalytical(p => p.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                <input style={inputStyle} value={a.min} placeholder="min" inputMode="decimal" onChange={e => setAnalytical(p => p.map((x, idx) => idx === i ? { ...x, min: e.target.value } : x))} />
                <input style={inputStyle} value={a.target} placeholder="target" inputMode="decimal" onChange={e => setAnalytical(p => p.map((x, idx) => idx === i ? { ...x, target: e.target.value } : x))} />
                <input style={inputStyle} value={a.max} placeholder="max" inputMode="decimal" onChange={e => setAnalytical(p => p.map((x, idx) => idx === i ? { ...x, max: e.target.value } : x))} />
                <input style={inputStyle} value={a.notes} placeholder="conditions of test" onChange={e => setAnalytical(p => p.map((x, idx) => idx === i ? { ...x, notes: e.target.value } : x))} />
                <button onClick={() => setAnalytical(p => p.filter((_, idx) => idx !== i))} style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setAnalytical(p => [...p, { name: '', min: '', target: '', max: '', notes: '' }])}>
              + Add value
            </Button>
          </div>

          {/* Cooking instructions */}
          <div>
            <label style={labelStyle}>Cooking instructions <span style={{ fontWeight: 400, color: '#9ca3af' }}>(one step per line)</span></label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: '120px', lineHeight: 1.6 }}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={'Fill kettle with water and heat up to 70C\nAdd citric acid, stir until dissolved\n...'}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          {(unresolved.length > 0 || incompleteNew.length > 0 || unpriced.length > 0) ? (
            <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
              ⚠ {unresolved.length + incompleteNew.length + unpriced.length} ingredient{unresolved.length + incompleteNew.length + unpriced.length !== 1 ? 's' : ''} left to validate — every row needs a ✓ before you can save
            </p>
          ) : <span />}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{existing ? 'Save changes' : 'Save recipe'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
