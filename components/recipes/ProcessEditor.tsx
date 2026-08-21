'use client'

import { useMemo, useState } from 'react'
import { Ingredient, PackUnit, RecipeUnit, SubIngredient, IngredientFormat, Currency, INGREDIENT_FORMATS, CURRENCY_SYMBOLS } from '@/types'
import { createIngredient, updateIngredient, getIngredients, recordStockMovement, normalizeIngredientName, normalizeSupplier } from '@/lib/firestore/ingredients'
import { toBaseAmount, findIngredientMatch } from '@/lib/costing'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

function r2(n: number) { return Math.round(n * 100) / 100 }

interface NewPack {
  supplier: string
  format: IngredientFormat
  formatOther: string
  packSize: string
  packUnit: PackUnit
  packPrice: string
  currency: Currency
  stock: string
}

interface SubRow {
  query: string                 // what's typed in the search box
  ingredientId: string          // linked ingredient ('' = not linked yet)
  amount: string
  unit: RecipeUnit
  newPack?: NewPack
}

export interface ProcessDraft {
  name: string
  description?: string
  laborMinutes?: number
  yieldAmount?: number
  yieldUnit?: PackUnit
  subs: { name: string; amount: number; unit: RecipeUnit }[]
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }

const emptyPack = (): NewPack => ({ supplier: '', format: 'bottle', formatOther: '', packSize: '', packUnit: 'kg', packPrice: '', currency: 'GBP', stock: '' })

// Create / edit a "process" ingredient — something made in-house from other
// ingredients. Approved processes are themselves pickable as ingredients here
// (and in recipes) — only direct cycles are blocked.
export default function ProcessEditor({
  existing, presetName, draft, ingredients, onSaved, onClose,
}: {
  existing?: Ingredient
  presetName?: string
  draft?: ProcessDraft
  ingredients: Ingredient[]
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const [lib, setLib] = useState<Ingredient[]>(ingredients)
  const [name, setName] = useState(existing?.name ?? draft?.name ?? presetName ?? '')
  const [description, setDescription] = useState(existing?.processDescription ?? draft?.description ?? '')
  const [laborMinutes, setLaborMinutes] = useState(
    existing?.laborMinutes != null ? String(existing.laborMinutes)
    : draft?.laborMinutes != null ? String(draft.laborMinutes) : ''
  )
  const [yieldAmount, setYieldAmount] = useState(existing ? String(existing.packSize) : draft?.yieldAmount != null ? String(draft.yieldAmount) : '')
  const [yieldUnit, setYieldUnit] = useState<PackUnit>(existing?.packUnit ?? draft?.yieldUnit ?? 'L')

  const initialSubs: SubRow[] = existing
    ? (existing.subIngredients ?? []).map(s => {
        const ing = ingredients.find(i => i.id === s.ingredientId)
        return { query: ing?.name ?? s.name, ingredientId: s.ingredientId, amount: String(s.amount), unit: s.unit }
      })
    : (draft?.subs ?? []).map(s => {
        const match = findIngredientMatch(s.name, ingredients)
        return { query: match?.name ?? s.name, ingredientId: match?.id ?? '', amount: String(s.amount), unit: s.unit }
      })
  const [subs, setSubs] = useState<SubRow[]>(initialSubs)
  const [saving, setSaving] = useState(false)
  const [activeSuggest, setActiveSuggest] = useState<number | null>(null)
  const [savingIngIdx, setSavingIngIdx] = useState<number | null>(null)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)

  const knownSuppliers = useMemo(
    () => [...new Set(lib.map(i => i.supplier).filter((x): x is string => !!x))].sort(),
    [lib]
  )

  // Pickable pool: EVERYTHING including approved house blends — except this
  // process itself and processes that directly contain it (cycle guard)
  const candidates = useMemo(
    () => lib.filter(i =>
      i.id !== existing?.id &&
      !(i.isProcess && existing && i.subIngredients?.some(s => s.ingredientId === existing.id))
    ),
    [lib, existing]
  )

  function setSub(i: number, patch: Partial<SubRow>) {
    setSubs(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const suggestionsFor = (row: SubRow) => {
    const q = normalizeIngredientName(row.query)
    if (!q) return []
    return candidates
      .filter(i => i.nameKey.includes(q))
      .sort((a, b) => (a.nameKey.startsWith(q) ? 0 : 1) - (b.nameKey.startsWith(q) ? 0 : 1) || a.name.localeCompare(b.name))
      .slice(0, 8)
  }

  async function savePriceFor(ing: Ingredient) {
    const price = parseFloat(priceInputs[ing.id])
    if (!(price > 0)) { toast.error('Enter the price you pay per ' + ing.packDescription); return }
    setSavingPriceId(ing.id)
    try {
      await updateIngredient(ing.id, { packPrice: price })
      setLib(await getIngredients())
      setPriceInputs(prev => { const n = { ...prev }; delete n[ing.id]; return n })
      toast.success(`${ing.name}: £${price.toFixed(2)} per ${ing.packDescription} saved`)
    } catch (e) { console.error(e); toast.error('Failed to save price') }
    finally { setSavingPriceId(null) }
  }

  async function saveNewIngredient(i: number) {
    const row = subs[i]
    const np = row.newPack
    if (!np || !row.query.trim()) return
    if (!parseFloat(np.packSize) || np.packPrice === '' || !np.supplier.trim() || (np.format === 'other' && !np.formatOther.trim())) {
      toast.error('Fill in format, volume, price and supplier first')
      return
    }
    setSavingIngIdx(i)
    try {
      const formatLabel = np.format === 'other' ? np.formatOther.trim() : np.format
      const ingName = row.query.trim().replace(/\s+/g, ' ')
      const id = await createIngredient({
        name: ingName,
        supplier: normalizeSupplier(np.supplier, knownSuppliers),
        format: np.format,
        currency: np.currency,
        packDescription: `${parseFloat(np.packSize)}${np.packUnit} ${formatLabel}`,
        packSize: parseFloat(np.packSize),
        packUnit: np.packUnit,
        packPrice: parseFloat(np.packPrice) || 0,
      })
      const stock = parseFloat(np.stock)
      if (stock > 0) {
        await recordStockMovement({ ingredientId: id, ingredientName: ingName, type: 'stocktake', packsDelta: stock, note: 'Counted while adding ingredient' })
      }
      setLib(await getIngredients())
      setSub(i, { ingredientId: id, query: ingName, newPack: undefined })
      toast.success(`“${ingName}” saved to your ingredients`)
    } catch (e) { console.error(e); toast.error('Failed to save ingredient') }
    finally { setSavingIngIdx(null) }
  }

  const cost = useMemo(() => {
    let total = 0; let complete = subs.length > 0
    for (const s of subs) {
      const ing = candidates.find(i => i.id === s.ingredientId)
      const amt = parseFloat(s.amount)
      if (!ing || !(amt > 0) || !(ing.pricePerUnit > 0)) { complete = false; continue }
      total += toBaseAmount(amt, s.unit).value * ing.pricePerUnit
    }
    const y = parseFloat(yieldAmount)
    return { total: r2(total), perUnit: y > 0 ? r2(total / y) : null, complete }
  }, [subs, candidates, yieldAmount])

  async function handleSave() {
    if (!name.trim()) { toast.error('Give the process a name'); return }
    const y = parseFloat(yieldAmount)
    if (!(y > 0)) { toast.error('Set how much one batch makes (yield)'); return }
    const validSubs = subs.filter(s => s.ingredientId && parseFloat(s.amount) > 0)
    if (validSubs.length === 0) { toast.error('Add at least one ingredient'); return }
    const unresolved = subs.filter(s => s.query.trim() && !s.ingredientId)
    if (unresolved.length > 0) { toast.error(`Pick or create: ${unresolved.map(s => s.query.trim()).join(', ')}`); return }

    setSaving(true)
    try {
      const subIngredients: SubIngredient[] = validSubs.map(s => {
        const ing = candidates.find(i => i.id === s.ingredientId)!
        return { ingredientId: s.ingredientId, name: ing.name, amount: parseFloat(s.amount), unit: s.unit }
      })
      const payload = {
        name: name.trim(),
        isProcess: true,
        processDescription: description,
        laborMinutes: laborMinutes !== '' ? parseFloat(laborMinutes) : undefined,
        subIngredients,
        packDescription: `${y}${yieldUnit} batch (made in-house)`,
        packSize: y,
        packUnit: yieldUnit,
        packPrice: cost.total,
      }
      let id: string
      if (existing) {
        await updateIngredient(existing.id, {
          ...payload,
          laborMinutes: payload.laborMinutes ?? 0,
          processDescription: description.trim(),
        })
        id = existing.id
      } else {
        id = await createIngredient(payload)
      }
      toast.success(`Process “${name.trim()}” saved — costs £${cost.total.toFixed(2)} per ${y}${yieldUnit} batch`)
      onSaved(id)
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Failed to save process')
    } finally {
      setSaving(false)
    }
  }

  const unresolvedCount = subs.filter(s => s.query.trim() && !s.ingredientId).length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '680px', border: '1px solid #e5e7eb', marginBottom: '40px' }}>

        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>⚙️ {existing ? 'Edit process' : 'New process'}</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>An ingredient you make in-house — its cost is the sum of what goes into it</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Process name *</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lemon Juice" />
            </div>
            <div>
              <label style={labelStyle}>Active labour time</label>
              <div style={{ position: 'relative' }}>
                <input style={inputStyle} inputMode="decimal" value={laborMinutes} onChange={e => setLaborMinutes(e.target.value)} placeholder="15" />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#9ca3af' }}>min</span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '-10px 0 0' }}>
            Labour = hands-on time only (weighing, mixing, filtering) — not resting or infusing time.
          </p>

          <div>
            <label style={labelStyle}>How is it made? <span style={{ fontWeight: 400, color: '#9ca3af' }}>(quick description)</span></label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '64px', lineHeight: 1.5 }}
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Mix water and limes, let sit for 3 hours, strain." />
          </div>

          <div>
            <label style={labelStyle}>One batch makes *</label>
            <div style={{ display: 'flex', gap: '6px', maxWidth: '220px' }}>
              <input style={inputStyle} inputMode="decimal" value={yieldAmount} onChange={e => setYieldAmount(e.target.value)} placeholder="5" />
              <select style={{ ...inputStyle, width: '90px', padding: '9px 6px' }} value={yieldUnit} onChange={e => setYieldUnit(e.target.value as PackUnit)}>
                <option value="L">L</option>
                <option value="kg">kg</option>
                <option value="unit">units</option>
              </select>
            </div>
          </div>

          {/* Sub-ingredients — searchable, house blends included, create inline */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Ingredients used per batch *</label>
              <span style={{ fontSize: '12px', fontWeight: 600, color: cost.complete ? '#166534' : '#92400e' }}>
                {cost.complete && cost.perUnit != null
                  ? `Batch: £${cost.total.toFixed(2)} → £${cost.perUnit.toFixed(2)}/${yieldUnit}`
                  : 'Cost incomplete'}
              </span>
            </div>

            {subs.map((s, i) => {
              const linked = s.ingredientId ? lib.find(l => l.id === s.ingredientId) : undefined
              const priced = !!linked && linked.packPrice > 0
              const suggestions = suggestionsFor(s)
              const status = !s.query.trim() ? 'empty' : priced ? 'ok' : linked ? 'price' : 'setup'
              return (
                <div key={i} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 90px 78px 32px', gap: '6px', alignItems: 'center' }}>
                    <span style={{
                      width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 700,
                      background: status === 'ok' ? '#dcfce7' : status === 'empty' ? '#f3f4f6' : '#fef3c7',
                      color: status === 'ok' ? '#166534' : status === 'empty' ? '#d1d5db' : '#92400e',
                    }}>
                      {status === 'ok' ? '✓' : status === 'price' ? '£' : status === 'setup' ? '?' : '·'}
                    </span>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...inputStyle, borderColor: status === 'ok' ? '#bbf7d0' : status === 'empty' ? '#e5e7eb' : '#fbbf24' }}
                        value={s.query}
                        placeholder="Type to search — house blends included"
                        onChange={e => { setSub(i, { query: e.target.value, ingredientId: '', newPack: undefined }); setActiveSuggest(i) }}
                        onFocus={() => setActiveSuggest(i)}
                        onBlur={() => setTimeout(() => setActiveSuggest(x => x === i ? null : x), 200)}
                      />
                      {linked && (
                        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#166534', pointerEvents: 'none' }}>
                          {linked.isProcess ? '⚙ ' : ''}{CURRENCY_SYMBOLS[linked.currency ?? 'GBP']}{linked.pricePerUnit.toFixed(2)}/{linked.packUnit}
                        </span>
                      )}
                      {activeSuggest === i && s.query.trim() && !s.ingredientId && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: '2px', overflow: 'hidden' }}>
                          {suggestions.map(sg => (
                            <button key={sg.id} onMouseDown={() => { setSub(i, { ingredientId: sg.id, query: sg.name, newPack: undefined }); setActiveSuggest(null) }}
                              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 12px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                              <span style={{ fontWeight: 500, color: '#111827' }}>{sg.isProcess ? '⚙️ ' : ''}{sg.name}</span>
                              <span style={{ color: '#9ca3af', fontSize: '12px' }}>{sg.packDescription} · {CURRENCY_SYMBOLS[sg.currency ?? 'GBP']}{sg.packPrice.toFixed(2)}</span>
                            </button>
                          ))}
                          <button onMouseDown={() => { setSub(i, { ingredientId: '', newPack: emptyPack() }); setActiveSuggest(null) }}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', borderTop: suggestions.length ? '1px solid #f3f4f6' : 'none', background: '#f0fdf4', cursor: 'pointer', fontSize: '13px', textAlign: 'left', color: '#166534', fontWeight: 600 }}>
                            + New ingredient “{s.query.trim()}”
                          </button>
                        </div>
                      )}
                    </div>
                    <input style={inputStyle} inputMode="decimal" placeholder="0" value={s.amount}
                      onChange={e => setSub(i, { amount: e.target.value })} />
                    <select style={{ ...inputStyle, padding: '9px 6px' }} value={s.unit}
                      onChange={e => setSub(i, { unit: e.target.value as RecipeUnit })}>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="L">L</option>
                      <option value="unit">unit</option>
                    </select>
                    <button onClick={() => setSubs(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                  </div>

                  {/* Linked but no price — fix inline */}
                  {linked && !(linked.packPrice > 0) && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: '10px', padding: '8px 12px', margin: '4px 0 2px 32px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#92400e' }}>
                        <strong>{linked.name}</strong> — add the price: what do you pay per {linked.packDescription}?
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>£</span>
                        <input style={{ ...inputStyle, width: '90px', padding: '7px 10px' }} inputMode="decimal" placeholder="0.00"
                          value={priceInputs[linked.id] ?? ''}
                          onChange={e => setPriceInputs(prev => ({ ...prev, [linked.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePriceFor(linked) } }} />
                        <Button size="sm" onClick={() => savePriceFor(linked)} loading={savingPriceId === linked.id}>Save price</Button>
                      </div>
                    </div>
                  )}

                  {/* New ingredient created right here — no leaving the flow */}
                  {s.newPack && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e', borderRadius: '10px', padding: '12px 14px', margin: '4px 0 2px 32px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>New ingredient — “{s.query.trim()}”</p>
                      <p style={{ fontSize: '11px', color: '#4b7c5e', margin: '0 0 8px' }}>How do you <strong>order it from the supplier</strong>?</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 60px 100px 1fr 84px', gap: '6px' }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Format *</label>
                          <select style={{ ...inputStyle, padding: '9px 6px' }} value={s.newPack.format}
                            onChange={e => setSub(i, { newPack: { ...s.newPack!, format: e.target.value as IngredientFormat } })}>
                            {INGREDIENT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                          {s.newPack.format === 'other' && (
                            <input style={{ ...inputStyle, marginTop: '4px' }} value={s.newPack.formatOther} placeholder="e.g. sachet"
                              onChange={e => setSub(i, { newPack: { ...s.newPack!, formatOther: e.target.value } })} />
                          )}
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Volume *</label>
                          <input style={inputStyle} inputMode="decimal" value={s.newPack.packSize} placeholder="0.7"
                            onChange={e => setSub(i, { newPack: { ...s.newPack!, packSize: e.target.value } })} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Unit</label>
                          <select style={{ ...inputStyle, padding: '9px 6px' }} value={s.newPack.packUnit}
                            onChange={e => setSub(i, { newPack: { ...s.newPack!, packUnit: e.target.value as PackUnit } })}>
                            <option value="kg">kg</option>
                            <option value="L">L</option>
                            <option value="unit">units</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Price per unit *</label>
                          <div style={{ display: 'flex', gap: '3px' }}>
                            <select style={{ ...inputStyle, width: '44px', padding: '9px 3px' }} value={s.newPack.currency}
                              onChange={e => setSub(i, { newPack: { ...s.newPack!, currency: e.target.value as Currency } })}>
                              <option value="GBP">£</option>
                              <option value="EUR">€</option>
                              <option value="USD">$</option>
                            </select>
                            <input style={inputStyle} inputMode="decimal" value={s.newPack.packPrice} placeholder="14.50"
                              onChange={e => setSub(i, { newPack: { ...s.newPack!, packPrice: e.target.value } })} />
                          </div>
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>Supplier *</label>
                          <input style={inputStyle} value={s.newPack.supplier} placeholder="start typing…" list="process-supplier-suggestions"
                            onChange={e => setSub(i, { newPack: { ...s.newPack!, supplier: e.target.value } })} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '11px' }}>In stock now</label>
                          <input style={inputStyle} inputMode="decimal" value={s.newPack.stock} placeholder="packs"
                            onChange={e => setSub(i, { newPack: { ...s.newPack!, stock: e.target.value } })} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <Button size="sm" onClick={() => saveNewIngredient(i)} loading={savingIngIdx === i}>Save ingredient</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <datalist id="process-supplier-suggestions">
              {knownSuppliers.map(x => <option key={x} value={x} />)}
            </datalist>

            <Button variant="secondary" size="sm" onClick={() => setSubs(prev => [...prev, { query: '', ingredientId: '', amount: '', unit: 'kg' }])}>
              + Add ingredient
            </Button>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          {unresolvedCount > 0 ? (
            <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
              ⚠ {unresolvedCount} ingredient{unresolvedCount !== 1 ? 's' : ''} left to validate
            </p>
          ) : <span />}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{existing ? 'Save changes' : 'Save process'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
