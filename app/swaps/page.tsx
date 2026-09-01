'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { matchIngredient } from '@/lib/costing'
import { SWAPS, swapTotals, swapMaths, QUARTER_SPEND, Swap, SwapVerdict } from '@/lib/data/swaps'
import { LWC_LINES } from '@/lib/lwcSync'
import { retroFor } from '@/lib/data/pernodRetro'
import { findIngredientMatch } from '@/lib/costing'
import { Product, Recipe, Ingredient } from '@/types'
import { useTable, ColumnDef } from '@/hooks/useTable'

const SWAP_COLUMNS: ColumnDef<Swap>[] = [
  { key: 'take',    label: 'Take',        width: 46,  align: 'center', sortValue: (s) => (s.verdict === 'mandated' ? 0 : 1) },
  { key: 'from',    label: 'From',        width: 380, sortValue: (s) => s.from },
  { key: 'to',      label: 'To',          width: 200, sortValue: (s) => s.to },
  { key: 'btl',     label: 'Btl',         width: 66,  align: 'right', sortValue: (s) => s.bottles, descFirst: true },
  { key: 'saving',  label: 'Unit saving', width: 108, align: 'right', sortValue: (s) => (s.fromPrice - s.toPrice) * s.bottles, descFirst: true },
  { key: 'retro',   label: 'Retro',       width: 88,  align: 'right', sortValue: (s) => s.retroPerBottle * s.bottles, descFirst: true },
  { key: 'total',   label: 'Total',       width: 96,  align: 'right', sortValue: (s) => (s.fromPrice - s.toPrice) * s.bottles + s.retroPerBottle * s.bottles, descFirst: true },
  { key: 'verdict', label: 'Verdict',     width: 96,  sortValue: (s) => s.verdict },
]

interface GpRow {
  product: Product
  costNow: number | null
  costAfter: number | null
  sellPerLitre: number
  gpNow: number | null
  gpAfter: number | null
  delta: number | null
}

const GP_COLUMNS: ColumnDef<GpRow>[] = [
  { key: 'drink', label: 'Drink',          width: 220, sortValue: (d) => d.product.name },
  { key: 'sell',  label: 'Our sell £/L',   width: 116, align: 'right', sortValue: (d) => d.sellPerLitre, descFirst: true },
  { key: 'now',   label: 'Cost now',       width: 104, align: 'right', sortValue: (d) => d.costNow, descFirst: true },
  { key: 'after', label: 'Cost after',     width: 108, align: 'right', sortValue: (d) => d.costAfter, descFirst: true },
  { key: 'delta', label: 'Change',         width: 96,  align: 'right', sortValue: (d) => d.delta },
  { key: 'gpNow', label: 'Foodlab GP now', width: 126, align: 'right', sortValue: (d) => d.gpNow, descFirst: true },
  { key: 'gpAft', label: 'After',          width: 92,  align: 'right', sortValue: (d) => d.gpAfter, descFirst: true },
]

const td: React.CSSProperties = {
  padding: '11px 12px', fontSize: '13px', color: '#374151', textAlign: 'right',
  whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
}
const card: React.CSSProperties = { background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '20px 22px' }

const VERDICT: Record<SwapVerdict, { label: string; bg: string; fg: string; blurb: string }> = {
  mandated: { label: 'Take it', bg: '#dcfce7', fg: '#166534', blurb: 'The contract names the product. Move now.' },
  refuse:   { label: 'Refuse',  bg: '#fee2e2', fg: '#991b1b', blurb: 'On the list, and still the wrong call.' },
  taste:    { label: 'Tasting', bg: '#fef3c7', fg: '#92400e', blurb: 'Nothing to do with Pernod. A quality decision.' },
}

function money(n: number) { return '£' + n.toFixed(2) }
function r2(n: number) { return Math.round(n * 100) / 100 }

export default function SwapsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [taken, setTaken] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('foodlab-swaps-taken') || '{}') } catch { return {} }
  })
  const [brief, setBrief] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [coreOnly, setCoreOnly] = useState(true)
  // A different replacement, chosen off the trade list before anything is agreed.
  const [target, setTarget] = useState<Record<string, { to: string; toPrice: number; toLitres: number; retroPerBottle: number }>>({})
  const [picking, setPicking] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const swapCols = useTable<Swap>('swaps', SWAP_COLUMNS)
  const gpCols = useTable<GpRow>('swaps-gp', GP_COLUMNS)

  useEffect(() => {
    Promise.all([getProducts(), getRecipes(), getIngredients()])
      .then(([p, r, i]) => { setProducts(p); setRecipes(r); setIngredients(i) })
      .finally(() => setLoading(false))
  }, [])

  // Mandated swaps are on by default; refusals off; tastings off until Mark rules.
  // Apply whatever replacement has been chosen, then everything downstream —
  // savings, retro, totals, the drink re-cost — follows from it.
  const withTargets = (s: Swap): Swap => ({ ...s, ...(target[s.from] ?? {}) })
  const swaps = SWAPS.map(withTargets)

  const isTaken = (s: Swap) => taken[s.from] ?? s.verdict === 'mandated'
  const active = swaps.filter(isTaken)
  const totals = swapTotals(active)

  // Re-price the library under the selected swaps, then re-cost every recipe.
  const drinks = useMemo(() => {
    const swapped = ingredients.map((ing) => {
      const hit = active.find((s) => findIngredientMatch(s.from, [ing]))
      if (!hit || !ing.packSize) return ing
      // Pack sizes differ between the two sides, so the comparison is per litre.
      const perLitreNow = hit.fromLitres > 0 ? hit.fromPrice / hit.fromLitres : 0
      const perLitreAfter = hit.toLitres > 0 ? hit.toPrice / hit.toLitres : 0
      const ratio = perLitreNow > 0 ? perLitreAfter / perLitreNow : 1
      const packPrice = r2(ing.packPrice * ratio)
      return { ...ing, packPrice, pricePerUnit: packPrice / ing.packSize }
    })

    const costOf = (recipe: Recipe | undefined, lib: Ingredient[]): number | null => {
      if (!recipe || !recipe.ingredients.length) return null
      let total = 0
      let any = false
      for (const row of recipe.ingredients) {
        const ing = matchIngredient(row, lib)
        if (!ing || !(ing.pricePerUnit > 0)) continue
        total += row.qtyPer1L * ing.pricePerUnit
        any = true
      }
      return any ? r2(total) : null
    }

    return products
      .filter((p) => p.isActive !== false)
      .filter((p) => (coreOnly ? p.isClassic : true))
      .map((p) => {
        const recipe = recipes.find((r) => r.productId === p.id)
        const costNow = costOf(recipe, ingredients)
        const costAfter = costOf(recipe, swapped)
        const sell = p.defaultPricePerLitre ?? 0
        const gp = (c: number | null) => (c === null || sell <= 0 ? null : ((sell - c) / sell) * 100)
        return {
          product: p, costNow, costAfter, sellPerLitre: sell,
          gpNow: gp(costNow), gpAfter: gp(costAfter),
          delta: costNow !== null && costAfter !== null ? r2(costAfter - costNow) : null,
        }
      })
      .filter((d) => d.delta !== null && Math.abs(d.delta) > 0.005)
      .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
  }, [products, recipes, ingredients, active, coreOnly])

  const router = useRouter()

  // The decision has to survive the page. Which swaps we are taking is an input
  // to the pricing, so it is stored rather than re-ticked every time.
  function commit() {
    try {
      localStorage.setItem('foodlab-swaps-taken', JSON.stringify(
        Object.fromEntries(SWAPS.map((s) => [s.from, isTaken(s)]))
      ))
    } catch { /* private mode */ }
    router.push('/pricing')
  }

  async function generate() {
    setThinking(true)
    setBrief(null)
    try {
      const res = await fetch('/api/ai/swap-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swaps: active.map((s) => ({
            verdict: s.verdict, from: s.from, to: s.to, bottles: s.bottles,
            saving: (s.fromPrice - s.toPrice) * s.bottles,
            retro: s.retroPerBottle * s.bottles,
            note: s.note,
          })),
          totals, quarterSpend: QUARTER_SPEND,
          drinks: drinks.map((d) => ({
            name: d.product.name, costNow: d.costNow, costAfter: d.costAfter,
            gpNow: d.gpNow, gpAfter: d.gpAfter, sellPerLitre: d.sellPerLitre,
          })),
        }),
      })
      const json = await res.json()
      setBrief(json.text ?? json.error ?? 'No response.')
    } catch (e) {
      setBrief(String(e))
    } finally {
      setThinking(false)
    }
  }

  const pct = (totals.total / QUARTER_SPEND) * 100

  return (
    <div>
      <Header
        title="Swaps & re-cost"
        subtitle="Which spirits we move, what it is worth, and what it does to our own margin."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" onClick={generate} loading={thinking}>✦ Write the outcome</Button>
            <Link href="/lwc"><Button size="sm" variant="secondary">Apply prices →</Button></Link>
            <Button size="sm" onClick={commit}>Lock in {active.length} &amp; price them up →</Button>
          </div>
        }
      />

      {/* What this page is, in plain words */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <p style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: 1.6, color: '#374151', maxWidth: '78ch' }}>
          Our venues sit inside Lowline&apos;s Pernod Ricard contract, so the brands we pour count toward group volumes
          and earn cash retro. Chris has asked us to move onto contract brands. <strong>This page decides which swaps we take.</strong>
        </p>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.6, color: '#6b7280', maxWidth: '78ch' }}>
          Tick a swap and every recipe re-costs underneath it, so you can see what it does to Foodlab&apos;s own gross
          profit before agreeing to anything. <strong style={{ color: '#374151' }}>The Dry Martini is the one to watch</strong> —
          690ml of every litre is Tanqueray Ten at £36.24, and Beefeater is the mandated house gin at 45% less per litre.
          That single swap takes the drink from £3.20 a serve to £1.86, which is the difference between sitting above the
          market band and sitting below Mr Lyan.
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'Swaps taken', v: `${active.length}/${SWAPS.length}` },
          { k: 'Bottles moved', v: String(totals.bottles) },
          { k: 'Unit cost saved', v: money(totals.costSaving) },
          { k: 'Retro earned', v: money(totals.retro) },
          { k: 'Total, on the quarter', v: money(totals.total) },
          { k: 'Of LWC spend', v: `${pct.toFixed(1)}%`, warn: pct < 10 },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {pct < 10 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#92400e', lineHeight: 1.55 }}>
            <strong>Mark&apos;s brief estimated 10–15%.</strong> On the real price list it is {pct.toFixed(1)}%.
            The case for these swaps is contract compliance, not cash — better he hears the real number from you than from Chris&apos;s report.
          </p>
        </div>
      )}

      {/* The swaps */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto', marginBottom: '18px' }}>
        <table className="dt" style={{ minWidth: swapCols.minWidth }}>
          <swapCols.ColGroup />
          <swapCols.Head />
          <tbody>
            {swapCols.sortRows(swaps).map((s) => {
              const m = swapMaths(s)
              const saving = m.unitSaving
              const retro = m.retro
              const v = VERDICT[s.verdict]
              const on = isTaken(s)
              return (
                <tr key={s.from} style={{ borderBottom: '1px solid #f9fafb', opacity: on ? 1 : 0.55 }}>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={on} onChange={(e) => setTaken({ ...taken, [s.from]: e.target.checked })} />
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{s.from}</span>
                    <span style={{ color: '#9ca3af', marginLeft: '7px', fontSize: '12px' }}>{money(s.fromPrice)}</span>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#9ca3af', lineHeight: 1.5, whiteSpace: 'normal', maxWidth: '52ch' }}>{s.note}</p>
                  </td>
                  <td className="dt-wrap" style={{ ...td, textAlign: 'left' }}>
                    <button
                      onClick={() => { setPicking(picking === s.from ? null : s.from); setQ('') }}
                      title="Choose a different replacement from the LWC list"
                      style={{
                        border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
                        textAlign: 'left', borderBottom: '1px dotted #d1d5db',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#111827' }}>{s.to}</span>
                      <span style={{ color: '#9ca3af', marginLeft: '7px', fontSize: '12px' }}>
                        {money(s.toPrice)} · {s.toLitres}L
                      </span>
                    </button>
                    {target[s.from] && (
                      <span style={{ marginLeft: '7px', fontSize: '10px', fontWeight: 700, color: '#2b3a8f' }}>CHANGED</span>
                    )}

                    {picking === s.from && (
                      <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', padding: '8px' }}>
                        <input
                          autoFocus
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Search the LWC list…"
                          style={{ width: '100%', padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12.5px', outline: 'none' }}
                        />
                        <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '6px' }}>
                          {q.length > 1 && ingredients
                            .filter((ing) => ing.packUnit === 'L' && ing.packSize > 0 && ing.name.toLowerCase().includes(q.toLowerCase()))
                            .slice(0, 12)
                            .map((ing) => {
                              const rt = retroFor(ing.name)
                              return (
                                <button
                                  key={'ing-' + ing.id}
                                  onClick={() => {
                                    setTarget({
                                      ...target,
                                      [s.from]: {
                                        to: ing.name, toPrice: ing.packPrice, toLitres: ing.packSize,
                                        retroPerBottle: rt?.perBottle ?? 0,
                                      },
                                    })
                                    setPicking(null)
                                  }}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                                    background: '#f9fafb', cursor: 'pointer', padding: '5px 6px', fontSize: '12px',
                                    borderRadius: '5px', color: '#374151', marginBottom: '2px',
                                  }}
                                >
                                  <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#2b3a8f', marginRight: '6px' }}>STOCK</span>
                                  {ing.name}
                                  <span style={{ color: '#9ca3af', marginLeft: '6px' }}>
                                    {money(ing.packPrice)} · {money(ing.pricePerUnit)}/L
                                  </span>
                                </button>
                              )
                            })}
                          {LWC_LINES
                            .filter((l) => l.litres && q.length > 1 && l.name.toLowerCase().includes(q.toLowerCase()))
                            .slice(0, 40)
                            .map((l) => {
                              const rt = retroFor(l.name)
                              return (
                                <button
                                  key={l.code}
                                  onClick={() => {
                                    setTarget({
                                      ...target,
                                      [s.from]: {
                                        to: l.name, toPrice: l.price, toLitres: l.litres as number,
                                        retroPerBottle: rt?.perBottle ?? 0,
                                      },
                                    })
                                    setPicking(null)
                                  }}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                                    background: 'none', cursor: 'pointer', padding: '5px 6px', fontSize: '12px',
                                    borderRadius: '5px', color: '#374151',
                                  }}
                                >
                                  {l.name}
                                  <span style={{ color: '#9ca3af', marginLeft: '6px' }}>
                                    {money(l.price)} · {money(l.price / (l.litres as number))}/L
                                  </span>
                                  {rt && <span style={{ color: '#166534', marginLeft: '6px' }}>retro {money(rt.perBottle)}</span>}
                                </button>
                              )
                            })}
                          {q.length > 1 && !LWC_LINES.some((l) => l.litres && l.name.toLowerCase().includes(q.toLowerCase())) && (
                            <p style={{ margin: '6px', fontSize: '12px', color: '#9ca3af' }}>Nothing on the list matches.</p>
                          )}
                          {q.length <= 1 && (
                            <p style={{ margin: '6px', fontSize: '12px', color: '#9ca3af' }}>
                              Type two letters to search your stock take and the 861 trade lines.
                            </p>
                          )}
                        </div>
                        {target[s.from] && (
                          <button
                            onClick={() => {
                              const next = { ...target }; delete next[s.from]; setTarget(next); setPicking(null)
                            }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11.5px', color: '#9ca3af', padding: '4px 6px' }}
                          >Back to the contract default</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, color: '#9ca3af' }}>{s.bottles || '—'}</td>
                  <td style={{ ...td, color: saving < 0 ? '#b91c1c' : saving > 0 ? '#166534' : '#9ca3af', fontWeight: saving ? 700 : 400 }}>
                    {saving ? money(saving) : '—'}
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>{retro ? money(retro) : '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: saving + retro < 0 ? '#b91c1c' : '#111827' }}>
                    {saving + retro ? money(r2(saving + retro)) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: v.bg, color: v.fg }}>{v.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Foodlab GP impact */}
      <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>What it does to our margin</h2>
        <span style={{ fontSize: '12.5px', color: '#9ca3af' }}>
          Foodlab GP against our own sell price, before and after the ticked swaps
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} />
          Core classics only
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading recipes…</p>
      ) : drinks.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
            No costed drink uses any of the ticked swaps yet. Run the LWC price import first so the ingredient library
            carries real prices, then this fills in.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: gpCols.minWidth }}>
            <gpCols.ColGroup />
            <gpCols.Head />
            <tbody>
              {gpCols.sortRows(drinks).map((d) => {
                const better = (d.delta ?? 0) < 0
                return (
                  <tr key={d.product.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#111827' }}>{d.product.name}</td>
                    <td style={{ ...td, color: '#9ca3af' }}>{d.sellPerLitre ? money(d.sellPerLitre) : '—'}</td>
                    <td style={td}>{d.costNow !== null ? money(d.costNow) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{d.costAfter !== null ? money(d.costAfter) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: better ? '#166534' : '#b91c1c' }}>
                      {d.delta !== null ? (d.delta > 0 ? '+' : '') + d.delta.toFixed(2) : '—'}
                    </td>
                    <td style={{ ...td, borderLeft: '1px solid #f3f4f6', color: '#6b7280' }}>
                      {d.gpNow !== null ? d.gpNow.toFixed(0) + '%' : '—'}
                    </td>
                    <td style={td}>
                      {d.gpAfter !== null
                        ? <span style={{
                            fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                            background: d.gpAfter >= 60 ? '#f0fdf4' : d.gpAfter >= 45 ? '#fefce8' : '#fef2f2',
                            color: d.gpAfter >= 60 ? '#166534' : d.gpAfter >= 45 ? '#854d0e' : '#991b1b',
                          }}>{d.gpAfter.toFixed(0)}%</span>
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI outcome */}
      {(brief || thinking) && (
        <div style={{ ...card, marginTop: '18px', background: '#fcfcfd' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
            The outcome
          </p>
          {thinking ? (
            <p style={{ fontSize: '13.5px', color: '#9ca3af', margin: 0 }}>Reading the numbers…</p>
          ) : (
            <>
              <div style={{ fontSize: '14px', lineHeight: 1.65, color: '#374151', maxWidth: '76ch', whiteSpace: 'pre-wrap' }}>{brief}</div>
              <button
                onClick={() => navigator.clipboard.writeText(brief ?? '')}
                style={{ marginTop: '14px', border: '1px solid #e5e7eb', background: '#fff', borderRadius: '7px', padding: '5px 11px', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}
              >
                Copy for Mark
              </button>
            </>
          )}
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '16px', lineHeight: 1.6, maxWidth: '78ch' }}>
        Bottle counts are our own LWC orders, June to August 2026. Prices are LWC trade list. Retro is the cash schedule
        in the Pernod Ricard UK contract, pages 3–4. <strong style={{ color: '#6b7280' }}>Nothing here writes to the platform</strong> —
        tick freely, then apply the prices you have agreed on the LWC pricing page.
      </p>
    </div>
  )
}
