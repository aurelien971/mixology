'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getIngredients, createIngredient, updateIngredient, deleteIngredient, recordStockMovement, getStockMovements, normalizeSupplier } from '@/lib/firestore/ingredients'
import { getRecipes } from '@/lib/firestore/recipes'
import { getAllOrders } from '@/lib/firestore/orders'
import { recomputeAllProductCosts } from '@/lib/recipeSync'
import { buildShoppingList, ShoppingLine } from '@/lib/costing'
import { Ingredient, Recipe, Order, StockMovement, PackUnit, IngredientFormat, Currency, INGREDIENT_FORMATS, CURRENCY_SYMBOLS } from '@/types'
import toast from 'react-hot-toast'

type Tab = 'stock' | 'ingredients' | 'deliveries' | 'shopping'

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%' }
const th: React.CSSProperties = { textAlign: 'left', padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '13px', color: '#374151' }

function r2(n: number) { return Math.round(n * 100) / 100 }

export default function StockTakePage() {
  const [tab, setTab] = useState<Tab>('stock')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [ings, recs, ords, movs] = await Promise.all([getIngredients(), getRecipes(), getAllOrders(), getStockMovements(50)])
    setIngredients(ings); setRecipes(recs); setOrders(ords); setMovements(movs)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Orders that will consume stock but haven't yet (production not started)
  const upcomingOrders = useMemo(
    () => orders.filter(o => o.status === 'received' && o.type !== 'rd' && !o.stockDeducted),
    [orders]
  )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stock', label: `📦 Stock (${ingredients.length})` },
    { key: 'ingredients', label: '🧾 Ingredients & prices' },
    { key: 'deliveries', label: '📥 Add delivery' },
    { key: 'shopping', label: '🛒 Shopping list' },
  ]

  return (
    <div>
      <Header title="Stock take" subtitle="Ingredients, prices, stock on hand, and what to order next" />

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? '#111827' : '#6b7280',
            boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p> : (
        <>
          {tab === 'stock' && <StockTab ingredients={ingredients} movements={movements} onChanged={load} />}
          {tab === 'ingredients' && <IngredientsTab ingredients={ingredients} recipes={recipes} onChanged={load} />}
          {tab === 'deliveries' && <DeliveriesTab ingredients={ingredients} onChanged={load} />}
          {tab === 'shopping' && <ShoppingTab ingredients={ingredients} recipes={recipes} upcomingOrders={upcomingOrders} />}
        </>
      )}
    </div>
  )
}

// ── Stock tab — counts + stock take flow ─────────────────────────────────────

function StockTab({ ingredients, movements, onChanged }: { ingredients: Ingredient[]; movements: StockMovement[]; onChanged: () => void }) {
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const neverCounted = ingredients.filter(i => !i.stockUpdatedAt).length

  function startCount() {
    setCounts(Object.fromEntries(ingredients.map(i => [i.id, String(i.currentStock ?? 0)])))
    setCounting(true)
  }

  async function saveCount() {
    setSaving(true)
    try {
      let updated = 0
      for (const ing of ingredients) {
        const raw = counts[ing.id]
        if (raw === undefined || raw === '') continue
        const val = parseFloat(raw)
        if (isNaN(val)) continue
        if (val !== ing.currentStock || !ing.stockUpdatedAt) {
          await recordStockMovement({ ingredientId: ing.id, ingredientName: ing.name, type: 'stocktake', packsDelta: val, note: 'Manual stock take' })
          updated++
        }
      }
      toast.success(`Stock take saved — ${updated} ingredient${updated !== 1 ? 's' : ''} updated`)
      setCounting(false)
      onChanged()
    } catch (e) { console.error(e); toast.error('Failed to save stock take') }
    finally { setSaving(false) }
  }

  if (ingredients.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>No ingredients yet</p>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Ingredients are created automatically as recipes are added — or add them in the “Ingredients & prices” tab.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', alignItems: 'start' }}>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Stock on hand</p>
            {neverCounted > 0 && !counting && (
              <p style={{ fontSize: '12px', color: '#92400e', margin: '2px 0 0' }}>{neverCounted} ingredient{neverCounted !== 1 ? 's' : ''} never counted — run your first stock take</p>
            )}
          </div>
          {counting ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => setCounting(false)}>Cancel</Button>
              <Button size="sm" onClick={saveCount} loading={saving}>Save stock take</Button>
            </div>
          ) : (
            <Button size="sm" onClick={startCount}>{neverCounted === ingredients.length ? 'Create first stock take' : 'New stock take'}</Button>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={th}>Ingredient</th>
              <th style={th}>Pack</th>
              <th style={{ ...th, textAlign: 'right' }}>{counting ? 'Count (packs)' : 'In stock (packs)'}</th>
              <th style={{ ...th, textAlign: 'right' }}>Last counted</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map(ing => (
              <tr key={ing.id} style={{ borderTop: '1px solid #f9fafb' }}>
                <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{ing.name}</td>
                <td style={{ ...td, color: '#9ca3af', fontSize: '12px' }}>{ing.packDescription}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {counting ? (
                    <input
                      style={{ ...inp, width: '90px', textAlign: 'right' }} inputMode="decimal"
                      value={counts[ing.id] ?? ''}
                      onChange={e => setCounts(prev => ({ ...prev, [ing.id]: e.target.value }))}
                    />
                  ) : (
                    <span style={{ fontWeight: 700, color: ing.currentStock <= 0 ? '#dc2626' : '#111827', fontFamily: 'monospace' }}>
                      {r2(ing.currentStock ?? 0)}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#9ca3af', fontSize: '12px' }}>
                  {ing.stockUpdatedAt ? format(ing.stockUpdatedAt, 'd MMM HH:mm') : <span style={{ color: '#f59e0b' }}>never</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent movements */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '16px 18px' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Recent movements</p>
        {movements.length === 0 ? <p style={{ fontSize: '12px', color: '#d1d5db', margin: 0 }}>None yet</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {movements.slice(0, 15).map(m => (
              <div key={m.id} style={{ fontSize: '12px', borderBottom: '1px solid #f9fafb', paddingBottom: '7px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{m.ingredientName}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', color: m.packsDelta >= 0 ? '#166534' : '#dc2626' }}>
                    {m.packsDelta >= 0 ? '+' : ''}{r2(m.packsDelta)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
                  <span>{m.type}{m.orderNumber ? ` · ${m.orderNumber}` : ''}</span>
                  <span>{format(m.createdAt, 'd MMM HH:mm')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Ingredients tab — prices & suppliers, easy to edit ───────────────────────

function IngredientsTab({ ingredients, recipes, onChanged }: { ingredients: Ingredient[]; recipes: Recipe[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const emptyForm = { name: '', supplier: '', format: 'bottle' as IngredientFormat, formatOther: '', packSize: '', packUnit: 'kg' as PackUnit, packPrice: '', currency: 'GBP' as Currency }
  const [form, setForm] = useState(emptyForm)
  const knownSuppliers = [...new Set(ingredients.map(i => i.supplier).filter((x): x is string => !!x))].sort()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const usageCount = (id: string, name: string) =>
    recipes.filter(r => r.ingredients.some(ri => ri.ingredientId === id || ri.name.trim().toLowerCase() === name.toLowerCase())).length

  function startEdit(ing: Ingredient) {
    setAdding(false)
    setEditing(ing.id)
    const knownFormat = INGREDIENT_FORMATS.some(f => f.value === ing.format)
    setForm({
      name: ing.name, supplier: ing.supplier ?? '',
      format: knownFormat ? ing.format! : 'other',
      formatOther: knownFormat ? '' : (ing.format ?? ing.packDescription),
      packSize: String(ing.packSize), packUnit: ing.packUnit,
      packPrice: String(ing.packPrice), currency: ing.currency ?? 'GBP',
    })
  }

  async function save(id?: string) {
    if (!form.name.trim() || !parseFloat(form.packSize) || (form.format === 'other' && !form.formatOther.trim())) {
      toast.error('Name, format and volume are required'); return
    }
    setBusy(true)
    try {
      const formatLabel = form.format === 'other' ? form.formatOther.trim() : form.format
      const packDescription = `${parseFloat(form.packSize)}${form.packUnit} ${formatLabel}`
      const supplier = form.supplier ? normalizeSupplier(form.supplier, knownSuppliers) : undefined
      if (id) {
        await updateIngredient(id, {
          name: form.name, supplier,
          format: form.format, currency: form.currency,
          packDescription,
          packSize: parseFloat(form.packSize), packUnit: form.packUnit,
          packPrice: parseFloat(form.packPrice) || 0,
        })
      } else {
        await createIngredient({
          name: form.name, supplier,
          format: form.format, currency: form.currency,
          packDescription,
          packSize: parseFloat(form.packSize), packUnit: form.packUnit,
          packPrice: parseFloat(form.packPrice) || 0,
        })
      }
      // Prices changed → recompute every linked product's COGS
      const { updated } = await recomputeAllProductCosts()
      toast.success(`Saved${updated ? ` — ${updated} product cost${updated !== 1 ? 's' : ''} recalculated` : ''}`)
      setEditing(null); setAdding(false)
      onChanged()
    } catch (e) { console.error(e); toast.error('Failed to save') }
    finally { setBusy(false) }
  }

  async function remove(ing: Ingredient) {
    const uses = usageCount(ing.id, ing.name)
    if (uses > 0) { toast.error(`Used in ${uses} recipe${uses !== 1 ? 's' : ''} — remove it from those first`); return }
    if (!confirm(`Delete ${ing.name}?`)) return
    await deleteIngredient(ing.id)
    toast.success('Ingredient deleted')
    onChanged()
  }

  const editorRow = (id?: string) => (
    <tr style={{ background: '#f0fdf4' }}>
      <td style={td}><input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" /></td>
      <td style={td}>
        <input style={inp} value={form.supplier} list="stocktake-suppliers" onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier" />
        <datalist id="stocktake-suppliers">{knownSuppliers.map(x => <option key={x} value={x} />)}</datalist>
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <select style={{ ...inp, width: '104px', padding: '8px 4px' }} value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value as IngredientFormat }))}>
            {INGREDIENT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          {form.format === 'other' && (
            <input style={{ ...inp, width: '80px' }} value={form.formatOther} onChange={e => setForm(f => ({ ...f, formatOther: e.target.value }))} placeholder="sachet" />
          )}
          <input style={{ ...inp, width: '58px' }} inputMode="decimal" value={form.packSize} onChange={e => setForm(f => ({ ...f, packSize: e.target.value }))} placeholder="0.7" />
          <select style={{ ...inp, width: '54px', padding: '8px 4px' }} value={form.packUnit} onChange={e => setForm(f => ({ ...f, packUnit: e.target.value as PackUnit }))}>
            <option value="kg">kg</option><option value="L">L</option>
          </select>
        </div>
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
          <select style={{ ...inp, width: '46px', padding: '8px 3px' }} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))}>
            <option value="GBP">£</option><option value="EUR">€</option><option value="USD">$</option>
          </select>
          <input style={{ ...inp, width: '80px', textAlign: 'right' }} inputMode="decimal" value={form.packPrice} onChange={e => setForm(f => ({ ...f, packPrice: e.target.value }))} placeholder="0.00" />
        </div>
      </td>
      <td style={td} />
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        <Button size="sm" onClick={() => save(id)} loading={busy}>Save</Button>{' '}
        <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setAdding(false) }}>Cancel</Button>
      </td>
    </tr>
  )

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Ingredients & prices</p>
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>Change a price here and every recipe cost & product COGS updates automatically</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setAdding(true); setForm(emptyForm) }}>+ Add ingredient</Button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            <th style={th}>Ingredient</th>
            <th style={th}>Supplier</th>
            <th style={th}>Pack</th>
            <th style={{ ...th, textAlign: 'right' }}>Price / unit</th>
            <th style={{ ...th, textAlign: 'right' }}>Per kg·L</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {adding && editorRow()}
          {ingredients.map(ing => editing === ing.id ? (
            <EditKeyed key={ing.id}>{editorRow(ing.id)}</EditKeyed>
          ) : (
            <tr key={ing.id} style={{ borderTop: '1px solid #f9fafb' }}>
              <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                {ing.name}
                {usageCount(ing.id, ing.name) > 0 && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#9ca3af' }}>{usageCount(ing.id, ing.name)} recipe{usageCount(ing.id, ing.name) !== 1 ? 's' : ''}</span>}
              </td>
              <td style={{ ...td, color: '#6b7280' }}>{ing.supplier ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
              <td style={{ ...td, color: '#6b7280' }}>{ing.packDescription} <span style={{ color: '#d1d5db', fontSize: '11px' }}>({ing.packSize}{ing.packUnit})</span></td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: ing.packPrice > 0 ? '#111827' : '#dc2626' }}>
                {ing.packPrice > 0 ? `${CURRENCY_SYMBOLS[ing.currency ?? 'GBP']}${ing.packPrice.toFixed(2)}` : 'no price'}
              </td>
              <td style={{ ...td, textAlign: 'right', color: '#6b7280', fontFamily: 'monospace', fontSize: '12px' }}>
                {ing.pricePerUnit > 0 ? `${CURRENCY_SYMBOLS[ing.currency ?? 'GBP']}${ing.pricePerUnit.toFixed(2)}` : '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Button size="sm" variant="ghost" onClick={() => startEdit(ing)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(ing)} style={{ color: '#dc2626' } as React.CSSProperties}>×</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ingredients.length === 0 && !adding && (
        <p style={{ padding: '24px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>No ingredients yet — they're created automatically when recipes are added.</p>
      )}
    </div>
  )
}

// tbody can't key a fragment-less tr from a function call; tiny wrapper
function EditKeyed({ children }: { children: React.ReactNode }) { return <>{children}</> }

// ── Deliveries tab — paste supplier email → parsed → stock in ────────────────

interface ParsedItem { rawText: string; matchedIngredientId: string | null; matchedIngredientName: string | null; packs: number; confidence: string }

function DeliveriesTab({ ingredients, onChanged }: { ingredients: Ingredient[]; onChanged: () => void }) {
  const [email, setEmail] = useState('')
  const [parsing, setParsing] = useState(false)
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [supplier, setSupplier] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function parse() {
    if (!email.trim()) return
    setParsing(true)
    try {
      const res = await fetch('/api/ai/parse-supplier-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailText: email,
          ingredients: ingredients.map(i => ({ id: i.id, name: i.name, packDescription: i.packDescription, packSize: i.packSize, packUnit: i.packUnit })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `API error ${res.status}`)
      setItems(json.items ?? [])
      setSupplier(json.supplier ?? null)
      setNotes(json.notes ?? null)
      if (!(json.items ?? []).length) toast.error('No items found in that email')
    } catch (e) { console.error(e); toast.error(e instanceof Error ? e.message : 'Failed to parse email') }
    finally { setParsing(false) }
  }

  async function confirm() {
    if (!items) return
    const matched = items.filter(i => i.matchedIngredientId && i.packs > 0)
    if (!matched.length) { toast.error('Nothing matched to your ingredients'); return }
    setSaving(true)
    try {
      for (const item of matched) {
        const ing = ingredients.find(i => i.id === item.matchedIngredientId)
        if (!ing) continue
        await recordStockMovement({
          ingredientId: ing.id, ingredientName: ing.name,
          type: 'delivery', packsDelta: item.packs,
          note: `Delivery${supplier ? ` from ${supplier}` : ''}`,
        })
      }
      toast.success(`Stock updated — ${matched.length} ingredient${matched.length !== 1 ? 's' : ''} received`)
      setItems(null); setEmail('')
      onChanged()
    } catch (e) { console.error(e); toast.error('Failed to update stock') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>New supplier order arrived?</p>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 12px' }}>Paste the order email below — AI matches each item to your ingredients and adds the packs to stock.</p>
        <textarea
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder={'Hi team,\nPlease send:\n2x 25kg drums agave syrup\n6 bottles citric acid 1kg\n...'}
          style={{ ...inp, minHeight: '140px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <Button onClick={parse} loading={parsing} disabled={!email.trim()}>{parsing ? 'Reading email…' : 'Analyze email'}</Button>
        </div>
      </div>

      {items && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', marginTop: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
              Found {items.length} item{items.length !== 1 ? 's' : ''}{supplier ? ` — ${supplier}` : ''}
            </p>
            {notes && <p style={{ fontSize: '12px', color: '#92400e', margin: '4px 0 0' }}>⚠ {notes}</p>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={th}>From email</th>
                <th style={th}>Matched ingredient</th>
                <th style={{ ...th, textAlign: 'right' }}>Packs</th>
                <th style={th}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f9fafb' }}>
                  <td style={{ ...td, color: '#6b7280', fontSize: '12px' }}>{item.rawText}</td>
                  <td style={td}>
                    <select
                      style={{ ...inp, width: '200px' }}
                      value={item.matchedIngredientId ?? ''}
                      onChange={e => setItems(prev => prev!.map((x, idx) => idx === i ? { ...x, matchedIngredientId: e.target.value || null, matchedIngredientName: ingredients.find(g => g.id === e.target.value)?.name ?? null } : x))}
                    >
                      <option value="">— skip —</option>
                      {ingredients.map(g => <option key={g.id} value={g.id}>{g.name} ({g.packDescription})</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <input
                      style={{ ...inp, width: '70px', textAlign: 'right' }} inputMode="decimal"
                      value={String(item.packs)}
                      onChange={e => setItems(prev => prev!.map((x, idx) => idx === i ? { ...x, packs: parseFloat(e.target.value) || 0 } : x))}
                    />
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                      background: item.confidence === 'high' ? '#f0fdf4' : item.confidence === 'medium' ? '#fefce8' : '#fef2f2',
                      color: item.confidence === 'high' ? '#166534' : item.confidence === 'medium' ? '#854d0e' : '#991b1b',
                    }}>{item.confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '14px 18px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setItems(null)}>Discard</Button>
            <Button onClick={confirm} loading={saving}>Add to stock</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shopping list tab ────────────────────────────────────────────────────────

function ShoppingTab({ ingredients, recipes, upcomingOrders }: { ingredients: Ingredient[]; recipes: Recipe[]; upcomingOrders: Order[] }) {
  const { lines, unrecipedProducts } = useMemo(
    () => buildShoppingList(upcomingOrders, recipes, ingredients),
    [upcomingOrders, recipes, ingredients]
  )
  const toOrder = lines.filter(l => l.shortfallPacks > 0)
  const covered = lines.filter(l => l.shortfallPacks <= 0)

  function exportCsv() {
    const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const rows = [
      ['Ingredient', 'Supplier', 'Pack', 'Packs to order', 'In stock', 'Required', 'Needed by', 'For orders', 'Est. cost £'].join(','),
      ...toOrder.map(l => [
        esc(l.ingredient.name), esc(l.ingredient.supplier ?? ''), esc(l.ingredient.packDescription),
        Math.ceil(l.shortfallPacks), l.stockPacks, l.requiredPacks,
        l.neededBy ? format(l.neededBy, 'yyyy-MM-dd') : '',
        esc(l.forOrders.join(' ')), l.estCost,
      ].join(',')),
    ]
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `foodlab-shopping-list-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px' }}>
          <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 600 }}>Upcoming orders</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>{upcomingOrders.length}</p>
        </div>
        <div style={{ background: toOrder.length ? '#fef2f2' : '#f0fdf4', border: `1px solid ${toOrder.length ? '#fecaca' : '#bbf7d0'}`, borderRadius: '12px', padding: '14px 18px' }}>
          <p style={{ fontSize: '11px', color: toOrder.length ? '#991b1b' : '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 600 }}>Ingredients to order</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: toOrder.length ? '#dc2626' : '#166534', margin: 0 }}>{toOrder.length}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px' }}>
          <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 600 }}>Est. order cost</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>£{toOrder.reduce((s, l) => s + l.estCost, 0).toFixed(2)}</p>
        </div>
        {toOrder.length > 0 && (
          <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            <Button size="sm" variant="secondary" onClick={exportCsv}>↓ Export ordering list (CSV)</Button>
          </div>
        )}
      </div>

      {unrecipedProducts.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
            ⚠ These ordered drinks have no recipe yet, so their ingredients aren't counted: <strong>{unrecipedProducts.join(', ')}</strong> — add them in Recipes.
          </p>
        </div>
      )}

      {upcomingOrders.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '40px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>No upcoming orders — nothing to forecast. New client orders will appear here automatically.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={th}>Ingredient</th>
                <th style={{ ...th, textAlign: 'right' }}>Required (packs)</th>
                <th style={{ ...th, textAlign: 'right' }}>In stock</th>
                <th style={{ ...th, textAlign: 'right' }}>Order</th>
                <th style={th}>Needed by</th>
                <th style={th}>For orders</th>
                <th style={{ ...th, textAlign: 'right' }}>Est. £</th>
              </tr>
            </thead>
            <tbody>
              {[...toOrder, ...covered].map(l => (
                <tr key={l.ingredient.id} style={{ borderTop: '1px solid #f9fafb', background: l.shortfallPacks > 0 ? '#fffbfb' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                    {l.ingredient.name}
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af' }}>{l.ingredient.packDescription}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{l.requiredPacks}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{l.stockPacks}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {l.shortfallPacks > 0
                      ? <span style={{ fontWeight: 700, color: '#dc2626', fontFamily: 'monospace' }}>{Math.ceil(l.shortfallPacks)}</span>
                      : <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534', background: '#f0fdf4', padding: '2px 8px', borderRadius: '20px' }}>✓ covered</span>}
                  </td>
                  <td style={{ ...td, color: '#6b7280', fontSize: '12px' }}>{l.neededBy ? format(l.neededBy, 'd MMM') : '—'}</td>
                  <td style={{ ...td, color: '#9ca3af', fontSize: '11px', fontFamily: 'monospace' }}>{l.forOrders.join(', ')}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{l.shortfallPacks > 0 ? `£${l.estCost.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
