'use client'

import { useMemo, useState } from 'react'
import { Ingredient, PackUnit, RecipeUnit, SubIngredient, CURRENCY_SYMBOLS } from '@/types'
import { createIngredient, updateIngredient, getIngredients, normalizeIngredientName } from '@/lib/firestore/ingredients'
import { toBaseAmount } from '@/lib/costing'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

function r2(n: number) { return Math.round(n * 100) / 100 }

interface SubRow { ingredientId: string; amount: string; unit: RecipeUnit; rawName?: string }

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

// Create / edit a "process" ingredient — something made in-house from other
// ingredients (e.g. lemon juice = water + limes + 3h resting). Its price is
// always the SUM of its sub-ingredient costs, per batch made.
export default function ProcessEditor({
  existing, presetName, draft, ingredients, onSaved, onClose,
}: {
  existing?: Ingredient
  presetName?: string
  draft?: ProcessDraft              // pre-filled from an imported blend sheet
  ingredients: Ingredient[]         // full library (for sub-ingredient picking)
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(existing?.name ?? draft?.name ?? presetName ?? '')
  const [description, setDescription] = useState(existing?.processDescription ?? draft?.description ?? '')
  const [laborMinutes, setLaborMinutes] = useState(
    existing?.laborMinutes != null ? String(existing.laborMinutes)
    : draft?.laborMinutes != null ? String(draft.laborMinutes) : ''
  )
  const [yieldAmount, setYieldAmount] = useState(existing ? String(existing.packSize) : draft?.yieldAmount != null ? String(draft.yieldAmount) : '')
  const [yieldUnit, setYieldUnit] = useState<PackUnit>(existing?.packUnit ?? draft?.yieldUnit ?? 'L')
  const [subs, setSubs] = useState<SubRow[]>(
    existing
      ? (existing.subIngredients ?? []).map(s => ({ ingredientId: s.ingredientId, amount: String(s.amount), unit: s.unit }))
      : (draft?.subs ?? []).map(s => ({
          ingredientId: ingredients.find(i => !i.isProcess && i.nameKey === normalizeIngredientName(s.name))?.id ?? '',
          amount: String(s.amount), unit: s.unit, rawName: s.name,
        }))
  )
  const [saving, setSaving] = useState(false)
  const [lib, setLib] = useState<Ingredient[]>(ingredients)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)

  // Sub-ingredients can't be processes themselves — keeps costing simple and cycle-free
  const candidates = useMemo(
    () => lib.filter(i => !i.isProcess && i.id !== existing?.id),
    [lib, existing]
  )

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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 120, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '620px', border: '1px solid #e5e7eb', marginBottom: '40px' }}>

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

          {/* Sub-ingredients */}
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
              const ing = candidates.find(c => c.id === s.ingredientId)
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 78px 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={s.ingredientId}
                    onChange={e => setSubs(prev => prev.map((x, idx) => idx === i ? { ...x, ingredientId: e.target.value } : x))}>
                    <option value="">— pick ingredient —</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({CURRENCY_SYMBOLS[c.currency ?? 'GBP']}{c.pricePerUnit.toFixed(2)}/{c.packUnit})
                      </option>
                    ))}
                  </select>
                  <input style={inputStyle} inputMode="decimal" placeholder="0" value={s.amount}
                    onChange={e => setSubs(prev => prev.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} />
                  <select style={{ ...inputStyle, padding: '9px 6px' }} value={s.unit}
                    onChange={e => setSubs(prev => prev.map((x, idx) => idx === i ? { ...x, unit: e.target.value as RecipeUnit } : x))}>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                    <option value="unit">unit</option>
                  </select>
                  <button onClick={() => setSubs(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
                  {!s.ingredientId && s.rawName && (
                    <p style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#92400e', margin: 0 }}>⚠ Sheet says “{s.rawName}” — pick the matching ingredient, or add it in Stock take first</p>
                  )}
                  {ing && !(ing.pricePerUnit > 0) && (
                    <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: '#92400e' }}><strong>{ing.name}</strong> — add the price: what do you pay per {ing.packDescription}?</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 700 }}>£</span>
                        <input
                          style={{ ...inputStyle, width: '84px', padding: '6px 9px' }} inputMode="decimal" placeholder="0.00"
                          value={priceInputs[ing.id] ?? ''}
                          onChange={e => setPriceInputs(prev => ({ ...prev, [ing.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePriceFor(ing) } }}
                        />
                        <Button size="sm" onClick={() => savePriceFor(ing)} loading={savingPriceId === ing.id}>Save price</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <Button variant="secondary" size="sm" onClick={() => setSubs(prev => [...prev, { ingredientId: '', amount: '', unit: 'kg' }])}>
              + Add ingredient
            </Button>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '8px 0 0' }}>
              New ingredient not in the list yet? Add it first in Stock take → Ingredients & prices, then come back.
            </p>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{existing ? 'Save changes' : 'Save process'}</Button>
        </div>
      </div>
    </div>
  )
}
