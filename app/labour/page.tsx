'use client'

import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { deleteField } from 'firebase/firestore'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { NumInput, INK, SECONDARY, MUTED } from '@/components/onboarding/shared'
import { getProducts, updateProduct } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients, updateIngredient } from '@/lib/firestore/ingredients'
import { getCostingSettings, saveCostingSettings, CostingSettings, DEFAULT_COSTING } from '@/lib/firestore/costingSettings'
import { primaryRecipe } from '@/lib/liveCost'
import { batchCost, blendTimed, blendsIn, hourlyRate, packagingPerLitre } from '@/lib/batchCost'
import {
  CORE_RANGE, Ingredient, LaborBy, Product, Recipe, classicKeys, normalizeDrinkName, matchesClassic,
} from '@/types'
import toast from 'react-hot-toast'

/**
 * Labour & batch costing. A call sheet to go through with Dima — only the
 * blends and drinks the core range needs, in order — and the cost of every
 * core drink when we make it at the planned batch size.
 */

const money = (n: number) => '£' + n.toFixed(2)
const pct = (n: number) => n.toFixed(1) + '%'
const r2 = (n: number) => Math.round(n * 100) / 100

// Enter saves and jumps to the next box on the call sheet.
function nextBox(from: HTMLElement) {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('input[data-cs]')]
  const i = boxes.indexOf(from as HTMLInputElement)
  const next = boxes[i + 1]
  if (next) { next.focus(); next.select() }
}

function Box({ value, onSave, placeholder, unit, width = '84px' }: {
  value?: number
  onSave: (v: number | undefined) => void
  placeholder?: string
  unit?: string
  width?: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <input
        data-cs
        key={`b-${value ?? ''}`}
        defaultValue={value !== undefined ? String(value) : ''}
        inputMode="decimal"
        placeholder={placeholder}
        onBlur={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, '')
          const n = raw === '' ? undefined : parseFloat(raw)
          if (n !== undefined && !Number.isFinite(n)) return
          if (n === value) return
          onSave(n)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; el.blur(); nextBox(el) }
        }}
        style={{
          width, padding: '8px 10px', fontSize: '15px', fontFamily: 'monospace', textAlign: 'right', borderRadius: '8px',
          outline: 'none', color: INK,
          border: value === undefined ? '1.5px solid #fcd34d' : '1px solid #e5e7eb',
          background: value === undefined ? '#fffbeb' : '#fff',
        }}
      />
      {unit && <span style={{ fontSize: '12.5px', color: SECONDARY }}>{unit}</span>}
    </span>
  )
}

function WhoToggle({ value, onChange }: { value?: LaborBy; onChange: (v: LaborBy) => void }) {
  const who = value ?? 'dima'
  return (
    <span style={{ display: 'inline-flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      {(['dima', 'edward'] as LaborBy[]).map((w) => (
        <button key={w} onClick={() => w !== who && onChange(w)}
          style={{ padding: '6px 11px', fontSize: '12.5px', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: who === w ? '#111827' : '#fff', color: who === w ? '#fff' : SECONDARY }}>
          {w === 'dima' ? 'Dima' : 'Edward'}
        </button>
      ))}
    </span>
  )
}

const clear = <T,>(v: T | undefined) => (v === undefined ? (deleteField() as unknown as T) : v)

export default function LabourPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [s, setS] = useState<CostingSettings>(DEFAULT_COSTING)
  const [loading, setLoading] = useState(true)
  const [onlyMissing, setOnlyMissing] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [p, r, i, cs] = await Promise.all([getProducts(), getRecipes(), getIngredients(), getCostingSettings()])
      setProducts(p); setRecipes(r); setIngredients(i); setS(cs); setLoading(false)
    })()
  }, [])

  // The core drinks, each with the product and recipe the Core range page uses.
  const live = products.filter((p) => p.isActive !== false)
  const drinks = CORE_RANGE.map((spec) => {
    const keys = classicKeys(spec)
    const product = live.find((p) => p.isClassic && (matchesClassic(p.name) ?? p.name) === spec.name)
      ?? live.find((p) => keys.includes(normalizeDrinkName(p.name)))
    const recipe = product ? primaryRecipe(product, recipes) : undefined
    return { spec, product, recipe }
  })

  // Every house blend those recipes use, with the drinks that use it.
  const blendMap = new Map<string, { ing: Ingredient; usedIn: string[] }>()
  for (const d of drinks) {
    if (!d.recipe) continue
    for (const b of blendsIn(d.recipe, ingredients)) {
      const e = blendMap.get(b.id) ?? { ing: b, usedIn: [] }
      e.usedIn.push(d.spec.name)
      blendMap.set(b.id, { ...e, ing: b })
    }
  }
  const blends = [...blendMap.values()].sort((a, b) => b.usedIn.length - a.usedIn.length || a.ing.name.localeCompare(b.ing.name))

  const blendDone = (i: Ingredient) => blendTimed(i)
  const drinkDone = (p?: Product) => !!(p?.batchLaborMinutes && p.batchLaborMinutes > 0)
  const total = blends.length + drinks.filter((d) => d.product).length
  const done = blends.filter((b) => blendDone(b.ing)).length + drinks.filter((d) => drinkDone(d.product)).length

  async function saveBlend(ing: Ingredient, patch: Partial<Pick<Ingredient, 'laborMinutes' | 'laborBatchSize' | 'laborBy'>>) {
    try {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) data[k] = clear(v)
      await updateIngredient(ing.id, data as Partial<Ingredient>)
      setIngredients((all) => all.map((x) => (x.id === ing.id ? { ...x, ...patch } : x)))
    } catch { toast.error(`Could not save ${ing.name}`) }
  }

  async function saveDrink(p: Product, patch: Partial<Pick<Product, 'batchLaborMinutes' | 'batchLaborBy'>>) {
    try {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) data[k] = clear(v)
      await updateProduct(p.id, data as Partial<Product>)
      setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
    } catch { toast.error(`Could not save ${p.name}`) }
  }

  async function saveSetting(patch: Partial<CostingSettings>) {
    const next = { ...s, ...patch }
    setS(next)
    try { await saveCostingSettings(patch) } catch { toast.error('Could not save the setting') }
  }

  // The projection, one row per drink.
  const rows = drinks.map((d) => {
    const c = d.product ? batchCost(d.product, d.recipe, ingredients, s, d.spec.name) : null
    const price = d.product?.defaultPricePerLitre ?? null
    const gp = (cost: number | null) => (price && cost !== null ? ((price - cost) / price) * 100 : null)
    const serve = d.product?.recommendedServingG || null
    return {
      ...d, c, price, serve,
      gpIngredients: gp(c?.ingredientsPerLitre ?? null),
      gpLoaded: gp(c?.totalPerLitre ?? null),
    }
  })

  function exportExcel() {
    ;(async () => {
      const XLSX = await import('xlsx')
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
        Drink: r.spec.name,
        'Product code': r.product?.productCode ?? '',
        'Ingredients £/L': r.c?.ingredientsPerLitre != null ? r2(r.c.ingredientsPerLitre) : '',
        'Blend labour £/L': r.c ? r2(r.c.blendLabourPerLitre) : '',
        'Batch labour £/L': r.c?.batchLabourPerLitre != null ? r2(r.c.batchLabourPerLitre) : '',
        'Bag £/L': r.c ? r2(r.c.packagingPerLitre) : '',
        'Total cost £/L': r.c?.totalPerLitre != null ? r2(r.c.totalPerLitre) : '',
        'Price £/L': r.price ?? '',
        'Our GP % ingredients only': r.gpIngredients !== null ? Math.round(r.gpIngredients * 10) / 10 : '',
        'Our GP % fully loaded': r.gpLoaded !== null ? Math.round(r.gpLoaded * 10) / 10 : '',
        [`Cost per ${s.batchLitres}L batch £`]: r.c?.totalPerLitre != null ? r2(r.c.totalPerLitre * s.batchLitres) : '',
        [`Margin per ${s.batchLitres}L batch £`]: r.c?.totalPerLitre != null && r.price ? r2((r.price - r.c.totalPerLitre) * s.batchLitres) : '',
        'Labour still missing': r.c?.missingLabour.join(', ') ?? '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, sheet, `${s.batchLitres}L batches`)
      XLSX.writeFile(wb, `foodlab-${s.batchLitres}L-batch-costing-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    })()
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px', marginBottom: '16px' }
  const kicker: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }
  const rowStyle = (isDone: boolean): React.CSSProperties => ({
    display: 'grid', gridTemplateColumns: '28px minmax(180px, 1.4fr) minmax(160px, 1fr) auto', gap: '12px', alignItems: 'center',
    padding: '10px 12px', borderTop: '1px solid #f3f4f6', background: isDone ? '#fff' : '#fffdf5',
  })
  const tick = (isDone: boolean) => (
    <span style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
      background: isDone ? '#dcfce7' : '#fef3c7', color: isDone ? '#166534' : '#92400e' }}>{isDone ? '✓' : '?'}</span>
  )

  if (loading) return <p style={{ fontSize: '13px', color: MUTED }}>Loading…</p>

  const dimaRate = hourlyRate('dima', s)
  const shownBlends = blends.filter((b) => !onlyMissing || !blendDone(b.ing))
  const shownDrinks = drinks.filter((d) => d.product && (!onlyMissing || !drinkDone(d.product)))

  return (
    <div>
      <Header
        title="Labour & batch costing"
        subtitle={`Go through the call sheet with Dima, then read what every core drink costs at ${s.batchLitres} L batches.`}
        action={<Button size="sm" onClick={exportExcel}>↓ Export projection</Button>}
      />

      {/* Rates */}
      <div style={card}>
        <p style={kicker}>Rates and packaging</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 28px', alignItems: 'flex-end', fontSize: '13px', color: SECONDARY }}>
          <label>Dima salary £/yr<br /><NumInput value={s.dimaSalary} decimals={0} width="100px" onSave={(v) => v && saveSetting({ dimaSalary: v })} /></label>
          <label>Dima hours/week<br /><NumInput value={s.dimaHoursPerWeek} decimals={1} width="70px" onSave={(v) => v && saveSetting({ dimaHoursPerWeek: v })} /></label>
          <span style={{ paddingBottom: '6px' }}>= <strong style={{ color: INK }}>{money(dimaRate)}/h</strong></span>
          <label>Edward £/h<br /><NumInput value={s.edwardRate} width="70px" onSave={(v) => v && saveSetting({ edwardRate: v })} /></label>
          <label>Batch size L<br /><NumInput value={s.batchLitres} decimals={0} width="70px" onSave={(v) => v && saveSetting({ batchLitres: v })} /></label>
          <label>20 L bag £<br /><NumInput value={s.bag20Price} width="70px" onSave={(v) => v !== undefined && saveSetting({ bag20Price: v })} /></label>
          <label>5 L bag £<br /><NumInput value={s.bag5Price} width="70px" onSave={(v) => v !== undefined && saveSetting({ bag5Price: v })} /></label>
          <span>Pack into<br />
            <span style={{ display: 'inline-flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginTop: '2px' }}>
              {(['20', '5'] as const).map((f) => (
                <button key={f} onClick={() => saveSetting({ packFormat: f })}
                  style={{ padding: '5px 11px', fontSize: '12.5px', fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: s.packFormat === f ? '#111827' : '#fff', color: s.packFormat === f ? '#fff' : SECONDARY }}>{f} L bags</button>
              ))}
            </span>
          </span>
          <span style={{ paddingBottom: '6px' }}>= <strong style={{ color: INK }}>{money(packagingPerLitre(s))}/L</strong> packaging</span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: MUTED }}>
          Dima&apos;s rate is salary ÷ (hours × 52), before employer costs. Bags ex VAT from The Bag In Box Shop, INV-3556 (24 Aug 2026); boxes came free.
        </p>
      </div>

      {/* Call sheet */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div>
            <p style={{ ...kicker, margin: 0 }}>Call sheet — with Dima on the phone</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: SECONDARY }}>
              Type a number, press <strong>Enter</strong> — it saves and jumps to the next box. Hands-on minutes only, not resting or infusing. For blends, also the size of the batch those minutes make.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <label style={{ fontSize: '12.5px', color: SECONDARY, display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only what&apos;s missing
            </label>
            <span style={{ fontSize: '14px', fontWeight: 700, color: done === total ? '#166534' : INK }}>{done} of {total} done</span>
          </div>
        </div>
        <div style={{ height: '6px', borderRadius: '6px', background: '#f3f4f6', overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ width: `${total ? (done / total) * 100 : 0}%`, height: '100%', background: '#16a34a' }} />
        </div>

        <p style={{ margin: '14px 0 4px', fontSize: '13px', fontWeight: 700, color: INK }}>1. House blends — how long to make a batch, and how big is that batch?</p>
        {shownBlends.map(({ ing, usedIn }, n) => {
          const isDone = blendDone(ing)
          return (
            <div key={ing.id} style={rowStyle(isDone)}>
              {tick(isDone)}
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{n + 1}. {ing.name}</span>
                <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>used in {usedIn.join(', ')}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Box value={ing.laborMinutes || undefined} placeholder="min" unit="min for" onSave={(v) => saveBlend(ing, { laborMinutes: v })} />
                <Box value={ing.laborBatchSize} placeholder="batch" unit={ing.packUnit} width="70px" onSave={(v) => saveBlend(ing, { laborBatchSize: v })} />
              </div>
              <WhoToggle value={ing.laborBy} onChange={(w) => saveBlend(ing, { laborBy: w })} />
            </div>
          )
        })}
        {shownBlends.length === 0 && <p style={{ fontSize: '13px', color: MUTED, padding: '8px 12px' }}>All blends done.</p>}

        <p style={{ margin: '18px 0 4px', fontSize: '13px', fontWeight: 700, color: INK }}>
          2. Drinks — how long to make one {s.batchLitres} L batch, blends already made?
        </p>
        {shownDrinks.map(({ spec, product }, n) => {
          const isDone = drinkDone(product)
          return (
            <div key={spec.name} style={rowStyle(isDone)}>
              {tick(isDone)}
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{n + 1}. {spec.name}</span>
                <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>{product!.productCode}</span>
              </div>
              <div><Box value={product!.batchLaborMinutes || undefined} placeholder="min" unit={`min per ${s.batchLitres} L`} onSave={(v) => saveDrink(product!, { batchLaborMinutes: v })} /></div>
              <WhoToggle value={product!.batchLaborBy} onChange={(w) => saveDrink(product!, { batchLaborBy: w })} />
            </div>
          )
        })}
        {shownDrinks.length === 0 && <p style={{ fontSize: '13px', color: MUTED, padding: '8px 12px' }}>All drinks done.</p>}
      </div>

      {/* Projection */}
      <div style={card}>
        <p style={kicker}>What each drink costs at {s.batchLitres} L batches</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '980px' }}>
            <thead>
              <tr style={{ textAlign: 'right', color: MUTED, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {['Drink', 'Ingredients /L', 'Blend labour /L', 'Batch labour /L', 'Bag /L', 'Total /L', 'Price /L', 'Our GP — ingredients', 'Our GP — fully loaded', `Margin per ${s.batchLitres} L`].map((h, i) => (
                  <th key={h} style={{ padding: '8px 10px', fontWeight: 600, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = r.c
                const cell: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', color: INK, borderTop: '1px solid #f3f4f6' }
                const gpColour = (v: number | null) => (v === null ? MUTED : v >= 50 ? '#166534' : v >= 30 ? '#b45309' : '#b91c1c')
                return (
                  <tr key={r.spec.name}>
                    <td style={{ ...cell, textAlign: 'left', fontFamily: 'inherit', fontWeight: 600 }}>
                      {r.spec.name}
                      {c && c.missingLabour.length > 0 && (
                        <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#b45309' }}>needs minutes: {c.missingLabour.join(', ')}</span>
                      )}
                    </td>
                    <td style={cell}>{c?.ingredientsPerLitre != null ? money(c.ingredientsPerLitre) : '—'}</td>
                    <td style={cell}>{c ? money(c.blendLabourPerLitre) : '—'}</td>
                    <td style={cell}>{c?.batchLabourPerLitre != null ? money(c.batchLabourPerLitre) : '—'}</td>
                    <td style={cell}>{c ? money(c.packagingPerLitre) : '—'}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{c?.totalPerLitre != null ? money(c.totalPerLitre) : '—'}</td>
                    <td style={cell}>{r.price ? money(r.price) : '—'}</td>
                    <td style={{ ...cell, color: gpColour(r.gpIngredients), fontWeight: 600 }}>{r.gpIngredients !== null ? pct(r.gpIngredients) : '—'}</td>
                    <td style={{ ...cell, color: gpColour(r.gpLoaded), fontWeight: 700 }}>{r.gpLoaded !== null ? pct(r.gpLoaded) : '—'}</td>
                    <td style={cell}>{c?.totalPerLitre != null && r.price ? money((r.price - c.totalPerLitre) * s.batchLitres) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: MUTED }}>
          Ingredients: live recipe cost, before the Pernod retro. Blend labour: each blend&apos;s minutes over its batch, scaled to how much of it goes in a litre.
          Batch labour: the drink&apos;s minutes over {s.batchLitres} L. A drink shows a fully loaded GP once all its minutes are in.
        </p>
      </div>
    </div>
  )
}
