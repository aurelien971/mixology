'use client'

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getAllOrders } from '@/lib/firestore/orders'
import { getRecipes } from '@/lib/firestore/recipes'
import { getProducts } from '@/lib/firestore/catalog'
import { getIngredients } from '@/lib/firestore/ingredients'
import { toBaseAmount, matchIngredient } from '@/lib/costing'
import { Ingredient, Recipe, Product, Order } from '@/types'

function r2(n: number) { return Math.round(n * 100) / 100 }
function r1(n: number) { return Math.round(n * 10) / 10 }

const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', textAlign: 'right', fontFamily: 'monospace' }
const th: React.CSSProperties = { padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 12px', fontSize: '13px', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }

function GpBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ fontSize: '11px', color: '#d1d5db' }}>—</span>
  const c = pct >= 60 ? { bg: '#f0fdf4', t: '#166534' } : pct >= 45 ? { bg: '#fefce8', t: '#854d0e' } : { bg: '#fef2f2', t: '#991b1b' }
  return <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: c.bg, color: c.t }}>{r1(pct)}%</span>
}

function Delta({ value, invert, suffix }: { value: number; invert?: boolean; suffix?: string }) {
  if (Math.abs(value) < 0.005) return null
  const good = invert ? value < 0 : value > 0
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, marginLeft: '6px', color: good ? '#166534' : '#dc2626' }}>
      {value > 0 ? '+' : ''}{suffix === '%' ? r1(value) : r2(value).toLocaleString('en-GB')}{suffix ?? ''}
    </span>
  )
}

export default function CogsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [pricing, setPricing] = useState<{ productId: string; pricePerLitre: number; rrp: number }[]>([])
  const [loading, setLoading] = useState(true)

  // WHAT-IF state (nothing is saved — assumptions only)
  const [packOverrides, setPackOverrides] = useState<Record<string, string>>({})   // ingredientId → £/pack
  const [sellOverrides, setSellOverrides] = useState<Record<string, string>>({})   // productId → £/L

  useEffect(() => {
    Promise.all([
      getAllOrders(), getRecipes(), getProducts(), getIngredients(),
      getDocs(collection(db, 'accountPricing')).then(s => s.docs.map(d => {
        const x = d.data()
        return { productId: String(x.productId), pricePerLitre: Number(x.pricePerLitre) || 0, rrp: Number(x.rrp) || 0 }
      })),
    ]).then(([o, r, p, i, ap]) => {
      setOrders(o.filter(x => x.status !== 'cancelled' && x.type !== 'rd'))
      setRecipes(r); setProducts(p); setIngredients(i); setPricing(ap)
    }).finally(() => setLoading(false))
  }, [])

  // ── Effective ingredient prices under the what-if overrides ────────────────
  const { baseIngredients, whatIfIngredients } = useMemo(() => {
    const applyOverrides = (useOverrides: boolean): Ingredient[] => {
      // 1. raw ingredients with overridden pack prices
      const stage1 = ingredients.map(i => {
        const ov = useOverrides ? parseFloat(packOverrides[i.id] ?? '') : NaN
        const packPrice = !isNaN(ov) && ov >= 0 && !i.isProcess ? ov : i.packPrice
        return { ...i, packPrice, pricePerUnit: i.packSize > 0 ? packPrice / i.packSize : 0 }
      })
      // 2. re-derive process prices from their (possibly overridden) sub-ingredients
      return stage1.map(i => {
        if (!i.isProcess || !i.subIngredients?.length) return i
        let total = 0
        for (const sub of i.subIngredients) {
          const s = stage1.find(x => x.id === sub.ingredientId)
          if (s) total += toBaseAmount(sub.amount, sub.unit).value * s.pricePerUnit
        }
        return { ...i, packPrice: total, pricePerUnit: i.packSize > 0 ? total / i.packSize : 0 }
      })
    }
    return { baseIngredients: applyOverrides(false), whatIfIngredients: applyOverrides(true) }
  }, [ingredients, packOverrides])

  // ── Per-product: all-time litres, revenue, avg sell £/L, venue numbers ─────
  const drinks = useMemo(() => {
    const vol = new Map<string, { litres: number; revenue: number }>()
    for (const o of orders) {
      for (const li of o.lineItems) {
        const litres = li.quantity * (li.volumeLitres ?? 5)
        const ex = vol.get(li.productId) ?? { litres: 0, revenue: 0 }
        ex.litres += litres
        ex.revenue += li.lineTotal
        vol.set(li.productId, ex)
      }
    }
    const costPerLitre = (recipe: Recipe | undefined, lib: Ingredient[]): number | null => {
      if (!recipe || recipe.ingredients.length === 0) return null
      let total = 0
      for (const row of recipe.ingredients) {
        const ing = matchIngredient(row, lib)
        if (!ing || !(ing.pricePerUnit > 0)) continue
        total += row.qtyPer1L * ing.pricePerUnit
      }
      return total
    }
    return products
      .filter(p => p.isActive !== false)
      .map(p => {
        const v = vol.get(p.id) ?? { litres: 0, revenue: 0 }
        const recipe = recipes.find(r => r.productId === p.id)
        const baseSell = v.litres > 0 ? v.revenue / v.litres : (p.defaultPricePerLitre ?? 0)
        const ovSell = parseFloat(sellOverrides[p.id] ?? '')
        const sell = !isNaN(ovSell) && ovSell >= 0 ? ovSell : baseSell
        const baseCost = costPerLitre(recipe, baseIngredients)
        const whatIfCost = costPerLitre(recipe, whatIfIngredients)
        const ap = pricing.filter(x => x.productId === p.id && x.rrp > 0)
        const avgRrp = ap.length ? ap.reduce((s, x) => s + x.rrp, 0) / ap.length : 0
        const servingsPerLitre = (p.recommendedServingG || 200) > 0 ? 1000 / (p.recommendedServingG || 200) : 5
        const venueRevPerLitre = avgRrp * servingsPerLitre
        const venueGp = venueRevPerLitre > 0 && sell > 0 ? ((venueRevPerLitre - sell) / venueRevPerLitre) * 100 : null
        return {
          product: p, recipe, litres: r2(v.litres), revenue: r2(v.revenue),
          baseSell, sell, baseCost, whatIfCost, venueGp,
          ourGpBase: baseSell > 0 && baseCost !== null ? ((baseSell - baseCost) / baseSell) * 100 : null,
          ourGpWhatIf: sell > 0 && whatIfCost !== null ? ((sell - whatIfCost) / sell) * 100 : null,
        }
      })
      .sort((a, b) => b.litres - a.litres)
  }, [products, recipes, orders, baseIngredients, whatIfIngredients, sellOverrides, pricing])

  // ── Per-ingredient: all-time usage across everything we sold ───────────────
  const ingredientUsage = useMemo(() => {
    const usage = new Map<string, number>()  // ingredientId → base units consumed
    const add = (id: string, amt: number) => usage.set(id, (usage.get(id) ?? 0) + amt)
    for (const d of drinks) {
      if (!d.recipe || d.litres === 0) continue
      for (const row of d.recipe.ingredients) {
        const ing = matchIngredient(row, baseIngredients)
        if (!ing) continue
        const amt = row.qtyPer1L * d.litres
        if (ing.isProcess && ing.subIngredients?.length && ing.packSize > 0) {
          const batches = amt / ing.packSize
          add(ing.id, amt)
          for (const sub of ing.subIngredients) add(sub.ingredientId, toBaseAmount(sub.amount, sub.unit).value * batches)
        } else {
          add(ing.id, amt)
        }
      }
    }
    return [...usage.entries()]
      .map(([id, amount]) => {
        const base = baseIngredients.find(i => i.id === id)
        const whatIf = whatIfIngredients.find(i => i.id === id)
        if (!base) return null
        return {
          ing: ingredients.find(i => i.id === id)!,
          amount: r2(amount),
          baseSpend: r2(amount * base.pricePerUnit),
          whatIfSpend: r2(amount * (whatIf?.pricePerUnit ?? base.pricePerUnit)),
          basePerUnit: base.pricePerUnit,
          whatIfPerUnit: whatIf?.pricePerUnit ?? base.pricePerUnit,
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.baseSpend - a.baseSpend)
  }, [drinks, baseIngredients, whatIfIngredients, ingredients])

  // ── Headline totals (all-time weighting) ───────────────────────────────────
  const totals = useMemo(() => {
    let rev = 0, revBase = 0, cogsBase = 0, cogsWhatIf = 0, litres = 0
    for (const d of drinks) {
      if (d.litres === 0) continue
      litres += d.litres
      revBase += d.baseSell * d.litres
      rev += d.sell * d.litres
      if (d.baseCost !== null) cogsBase += d.baseCost * d.litres
      if (d.whatIfCost !== null) cogsWhatIf += d.whatIfCost * d.litres
    }
    const profitBase = revBase - cogsBase
    const profitWhatIf = rev - cogsWhatIf
    return {
      litres: r2(litres),
      revBase: r2(revBase), rev: r2(rev),
      cogsBase: r2(cogsBase), cogsWhatIf: r2(cogsWhatIf),
      profitBase: r2(profitBase), profitWhatIf: r2(profitWhatIf),
      gpBase: revBase > 0 ? (profitBase / revBase) * 100 : 0,
      gpWhatIf: rev > 0 ? (profitWhatIf / rev) * 100 : 0,
    }
  }, [drinks])

  const hasOverrides = Object.values(packOverrides).some(v => v !== '') || Object.values(sellOverrides).some(v => v !== '')

  if (loading) return <div><Header title="COGS & pricing" subtitle="Loading…" /><p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p></div>

  return (
    <div>
      <Header
        title="COGS & pricing"
        subtitle="What-if playground — tweak ingredient prices and sell prices, see profit move instantly. Nothing here is saved."
        action={hasOverrides ? <Button size="sm" variant="secondary" onClick={() => { setPackOverrides({}); setSellOverrides({}) }}>↺ Reset all assumptions</Button> : undefined}
      />

      {/* Headline: baseline vs what-if */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'All-time volume', value: `${totals.litres.toLocaleString('en-GB')} L`, delta: null as number | null, suffix: '' },
          { label: 'Revenue (all-time)', value: `£${totals.rev.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`, delta: r2(totals.rev - totals.revBase), suffix: '' },
          { label: 'Ingredient COGS', value: `£${totals.cogsWhatIf.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`, delta: r2(totals.cogsWhatIf - totals.cogsBase), suffix: '', invert: true },
          { label: 'Gross profit', value: `£${totals.profitWhatIf.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`, delta: r2(totals.profitWhatIf - totals.profitBase), suffix: '' },
          { label: 'Our GP', value: `${r1(totals.gpWhatIf)}%`, delta: r1(totals.gpWhatIf - totals.gpBase), suffix: '%' },
        ].map((c, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px' }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{c.label}</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>
              {c.value}
              {c.delta !== null && <Delta value={c.delta} invert={c.invert} suffix={c.suffix || undefined} />}
            </p>
          </div>
        ))}
      </div>

      {hasOverrides && (
        <div style={{ background: totals.profitWhatIf >= totals.profitBase ? '#f0fdf4' : '#fef2f2', border: `1px solid ${totals.profitWhatIf >= totals.profitBase ? '#bbf7d0' : '#fecaca'}`, borderRadius: '12px', padding: '12px 18px', marginBottom: '20px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: totals.profitWhatIf >= totals.profitBase ? '#166534' : '#991b1b', margin: 0 }}>
            These assumptions would have {totals.profitWhatIf >= totals.profitBase ? 'added' : 'cost'} £{Math.abs(r2(totals.profitWhatIf - totals.profitBase)).toLocaleString('en-GB', { maximumFractionDigits: 0 })} profit
            on all-time volumes ({r1(totals.gpWhatIf - totals.gpBase) > 0 ? '+' : ''}{r1(totals.gpWhatIf - totals.gpBase)} pts GP)
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* ── Drinks by volume ── */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Drinks by volume sold (all-time)</p>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>Edit “Sell £/L” to test pricing — venue GP reacts to sell price, our GP to both</p>
          </div>
          <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 5 }}>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Drink</th>
                  <th style={th}>Litres</th>
                  <th style={th}>Sell £/L</th>
                  <th style={th}>Cost £/L</th>
                  <th style={th}>Our GP</th>
                  <th style={th}>Venue GP</th>
                </tr>
              </thead>
              <tbody>
                {drinks.filter(d => d.litres > 0 || d.recipe).map(d => {
                  const costChanged = d.baseCost !== null && d.whatIfCost !== null && Math.abs(d.baseCost - d.whatIfCost) > 0.005
                  return (
                    <tr key={d.product.id} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ ...td, textAlign: 'left', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{d.product.name}</span>
                        {!d.recipe && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#dc2626' }}>no recipe</span>}
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{d.litres.toLocaleString('en-GB')}</td>
                      <td style={td}>
                        <input
                          style={{ ...inp, width: '72px', borderColor: sellOverrides[d.product.id] ? '#7e22ce' : '#e5e7eb', background: sellOverrides[d.product.id] ? '#faf5ff' : '#fff' }}
                          inputMode="decimal"
                          placeholder={r2(d.baseSell).toFixed(2)}
                          value={sellOverrides[d.product.id] ?? ''}
                          onChange={e => setSellOverrides(prev => ({ ...prev, [d.product.id]: e.target.value }))}
                        />
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', color: costChanged ? (d.whatIfCost! < d.baseCost! ? '#166534' : '#dc2626') : '#374151', fontWeight: costChanged ? 700 : 400 }}>
                        {d.whatIfCost !== null ? `£${r2(d.whatIfCost).toFixed(2)}` : '—'}
                      </td>
                      <td style={td}>
                        <GpBadge pct={d.ourGpWhatIf} />
                        {d.ourGpWhatIf !== null && d.ourGpBase !== null && Math.abs(d.ourGpWhatIf - d.ourGpBase) > 0.05 && (
                          <Delta value={r1(d.ourGpWhatIf - d.ourGpBase)} suffix="%" />
                        )}
                      </td>
                      <td style={td}><GpBadge pct={d.venueGp} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Ingredients by spend ── */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Ingredients by spend (all-time usage)</p>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>Edit “£/pack” to simulate a supplier switch — ⚙️ house blends re-derive automatically</p>
          </div>
          <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 5 }}>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Ingredient</th>
                  <th style={th}>Used</th>
                  <th style={th}>£/pack</th>
                  <th style={th}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {ingredientUsage.map(u => {
                  const changed = Math.abs(u.whatIfSpend - u.baseSpend) > 0.005
                  return (
                    <tr key={u.ing.id} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ ...td, textAlign: 'left', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{u.ing.isProcess ? '⚙️ ' : ''}{u.ing.name}</span>
                        <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af' }}>{u.ing.packDescription}</span>
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>
                        {u.amount.toLocaleString('en-GB')} {u.ing.packUnit === 'unit' ? 'u' : u.ing.packUnit}
                      </td>
                      <td style={td}>
                        {u.ing.isProcess ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }} title="Derived from its sub-ingredients">
                            £{r2(u.whatIfPerUnit * u.ing.packSize).toFixed(2)}
                          </span>
                        ) : (
                          <input
                            style={{ ...inp, width: '70px', borderColor: packOverrides[u.ing.id] ? '#7e22ce' : '#e5e7eb', background: packOverrides[u.ing.id] ? '#faf5ff' : '#fff' }}
                            inputMode="decimal"
                            placeholder={r2(u.ing.packPrice).toFixed(2)}
                            value={packOverrides[u.ing.id] ?? ''}
                            onChange={e => setPackOverrides(prev => ({ ...prev, [u.ing.id]: e.target.value }))}
                          />
                        )}
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: changed ? 700 : 400, color: changed ? (u.whatIfSpend < u.baseSpend ? '#166534' : '#dc2626') : '#374151' }}>
                        £{u.whatIfSpend.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                        {changed && <Delta value={r2(u.whatIfSpend - u.baseSpend)} invert />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: '#d1d5db', margin: '14px 0 0' }}>
        Weighting: all-time delivered volumes (R&D excluded). Purple fields are assumptions — they live only on this screen; real prices are changed in Stock take → Ingredients.
      </p>
    </div>
  )
}
