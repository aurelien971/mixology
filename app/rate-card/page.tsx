'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts, updateProduct } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { computeRecipeCost, RecipeCostLine } from '@/lib/costing'
import { Product, Recipe, Ingredient, CLASSIC_COCKTAILS, matchesClassic } from '@/types'
import { useTable, ColumnDef } from '@/hooks/useTable'

interface CardRow {
  product: Product
  servingMl: number
  costPerServe: number | null
  sellPerLitre: number
  sellPerServe: number
  rrp: number
  venueGp: number
  foodlabGp: number | null
  complete: boolean
  missing: string[]
  lines: RecipeCostLine[]
  costPerLitre: number
}

const COLUMNS: ColumnDef<CardRow>[] = [
  { key: 'star',   label: '★',            width: 36,  align: 'center', sortValue: (r) => (r.product.isClassic ? 0 : 1) },
  { key: 'name',   label: 'Product',      width: 230, sortValue: (r) => r.product.name },
  { key: 'cat',    label: 'Category',     width: 128, sortValue: (r) => r.product.category },
  { key: 'serve',  label: 'Serve',        width: 84,  align: 'right', sortValue: (r) => r.servingMl, descFirst: true },
  { key: 'perL',   label: 'Our £/L',      width: 96,  align: 'right', sortValue: (r) => r.sellPerLitre, descFirst: true },
  { key: 'perSrv', label: 'Our £/serve',  width: 108, align: 'right', sortValue: (r) => r.sellPerServe, descFirst: true },
  { key: 'rrp',    label: 'RRP',          width: 88,  align: 'right', sortValue: (r) => r.rrp, descFirst: true },
  { key: 'vgp',    label: 'Venue GP',     width: 100, align: 'right', sortValue: (r) => r.venueGp, descFirst: true },
  { key: 'cost',   label: 'Cost/serve',   width: 104, align: 'right', sortValue: (r) => r.costPerServe, descFirst: true },
  { key: 'fgp',    label: 'Foodlab GP',   width: 106, align: 'right', sortValue: (r) => r.foodlabGp, descFirst: true },
]

const td: React.CSSProperties = { padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

function r2(n: number) { return Math.round(n * 100) / 100 }
function money(n: number) { return '£' + n.toFixed(2) }

// Menu prices land on a psychological price point, not a raw calculation.
function toMenuPrice(n: number): number {
  return Math.max(0, Math.round(n * 2) / 2)
}

/**
 * Where a drink's cost actually comes from.
 *
 * A single mispriced ingredient — usually a pack size entered in millilitres
 * where the field wants litres — can put a recipe out by orders of magnitude
 * without anything else looking wrong. Sorting by contribution makes that
 * obvious in one glance, so the answer to "why is this drink £38?" is a click
 * rather than an afternoon.
 */
function CostBreakdown({ lines, costPerLitre, servingMl }: {
  lines: RecipeCostLine[]
  costPerLitre: number
  servingMl: number
}) {
  const priced = lines.filter((l) => l.costPer1L !== null && l.costPer1L > 0)
  const sorted = [...priced].sort((a, b) => (b.costPer1L ?? 0) - (a.costPer1L ?? 0))
  const unpriced = lines.filter((l) => l.costPer1L === null)
  const worst = sorted[0]
  // One line carrying nearly the whole cost is the signature of a bad price.
  const dominant = worst && costPerLitre > 0 && (worst.costPer1L ?? 0) / costPerLitre > 0.7

  return (
    <div style={{ padding: '16px 20px 20px' }}>
      {dominant && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 13px', marginBottom: '14px' }}>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#991b1b', lineHeight: 1.55 }}>
            <strong>{worst.name}</strong> is {Math.round(((worst.costPer1L ?? 0) / costPerLitre) * 100)}% of this drink&apos;s cost,
            at {money(worst.pricePerUnit ?? 0)} per kg or litre. If that price looks wrong, it almost always is —
            check the pack size on the ingredient: a 70cl bottle entered as <code>70</code> instead of <code>0.7</code>
            makes it a hundred times too expensive.
          </p>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', maxWidth: '760px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0 12px 7px 0', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>Ingredient</th>
            <th style={{ textAlign: 'right', padding: '0 12px 7px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>Per litre</th>
            <th style={{ textAlign: 'right', padding: '0 12px 7px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>£/kg or L</th>
            <th style={{ textAlign: 'right', padding: '0 12px 7px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>Cost/L</th>
            <th style={{ textAlign: 'right', padding: '0 0 7px 12px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l, n) => {
            const share = costPerLitre > 0 ? ((l.costPer1L ?? 0) / costPerLitre) * 100 : 0
            const odd = share > 70
            return (
              <tr key={l.name + n}>
                <td style={{ padding: '6px 12px 6px 0', color: odd ? '#991b1b' : '#374151', fontWeight: odd ? 700 : 400 }}>{l.name}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{l.qtyPer1L} {l.unit}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', color: odd ? '#991b1b' : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{money(l.pricePerUnit ?? 0)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(l.costPer1L ?? 0)}</td>
                <td style={{ padding: '6px 0 6px 12px', textAlign: 'right', color: odd ? '#991b1b' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{share.toFixed(0)}%</td>
              </tr>
            )
          })}
          <tr>
            <td colSpan={3} style={{ padding: '9px 12px 0 0', borderTop: '1px solid #f3f4f6', color: '#111827', fontWeight: 600 }}>
              Total, per litre
            </td>
            <td style={{ padding: '9px 12px 0', borderTop: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(costPerLitre)}</td>
            <td style={{ padding: '9px 0 0 12px', borderTop: '1px solid #f3f4f6' }} />
          </tr>
          <tr>
            <td colSpan={3} style={{ padding: '3px 12px 0 0', color: '#6b7280' }}>
              At a {servingMl}ml serve
            </td>
            <td style={{ padding: '3px 12px 0', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {money(r2((costPerLitre * servingMl) / 1000))}
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      {unpriced.length > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#92400e' }}>
          <strong>No price yet:</strong> {unpriced.map((l) => l.name).join(' · ')}
        </p>
      )}
    </div>
  )
}

export default function RateCardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  // The two levers Mark named: venue GP low-to-mid 80s, RRP £12–16.
  const [targetGp, setTargetGp] = useState(82)
  const [vat, setVat] = useState(20)
  const [coreOnly, setCoreOnly] = useState(false)
  const [classicsOnly, setClassicsOnly] = useState(false)
  const [category, setCategory] = useState('All')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const cols = useTable<CardRow>('rate-card', COLUMNS)

  useEffect(() => {
    Promise.all([getProducts(), getRecipes(), getIngredients()])
      .then(([p, r, i]) => { setProducts(p); setRecipes(r); setIngredients(i) })
      .finally(() => setLoading(false))
  }, [])

  // Every drink style present, so the filter only ever offers real options.
  const categories = useMemo(() => {
    const set = new Set(products.filter(p => p.isActive !== false).map(p => p.category).filter(Boolean) as string[])
    return ['All', ...Array.from(set).sort()]
  }, [products])

  const classicCount = products.filter(p => p.isClassic).length

  async function toggleClassic(p: Product) {
    setBusy(true)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isClassic: !p.isClassic } : x))
    try { await updateProduct(p.id, { isClassic: !p.isClassic }) } finally { setBusy(false) }
  }

  // Match the ten off the costing sheet against whatever they are called here.
  async function tagTheTen() {
    setBusy(true)
    try {
      const hits = products.filter(p => p.isActive !== false && !p.isClassic && matchesClassic(p.name))
      for (const p of hits) await updateProduct(p.id, { isClassic: true })
      setProducts(await getProducts())
    } finally { setBusy(false) }
  }

  const rows = useMemo(() => {
    return products
      .filter((p) => p.isActive !== false)
      .filter((p) => (coreOnly ? p.isCoreRange : true))
      .filter((p) => (classicsOnly ? p.isClassic : true))
      .filter((p) => (category === 'All' ? true : p.category === category))
      .map((p) => {
        const recipe = recipes.find((r) => r.productId === p.id)
        const cost = recipe ? computeRecipeCost(recipe, ingredients) : null
        const servingMl = p.recommendedServingG || 100
        const servingsPerLitre = 1000 / servingMl

        // What Foodlab charges the venue
        const sellPerLitre = p.defaultPricePerLitre ?? 0
        const sellPerServe = sellPerLitre / servingsPerLitre

        // Menu price the venue needs to hold the target GP on our liquid
        const netNeeded = targetGp > 0 ? sellPerServe / (1 - targetGp / 100) : 0
        const rrp = toMenuPrice(netNeeded * (1 + vat / 100))

        // Actual GP the venue makes at that menu price
        const netAtRrp = rrp / (1 + vat / 100)
        const venueGp = netAtRrp > 0 ? ((netAtRrp - sellPerServe) / netAtRrp) * 100 : 0

        const costPerServe = cost && cost.complete ? cost.costPerLitre / servingsPerLitre : null
        const foodlabGp = costPerServe !== null && sellPerServe > 0
          ? ((sellPerServe - costPerServe) / sellPerServe) * 100
          : null

        return {
          product: p, servingMl, costPerServe, sellPerLitre, sellPerServe,
          rrp, venueGp, foodlabGp, complete: cost?.complete ?? false,
          missing: cost?.missingIngredients ?? [],
          lines: cost?.lines ?? [], costPerLitre: cost?.costPerLitre ?? 0,
        }
      })
      .sort((a, b) => b.rrp - a.rrp) as CardRow[]
  }, [products, recipes, ingredients, targetGp, vat, coreOnly, classicsOnly, category])

  const priced = rows.filter((r) => r.costPerServe !== null)
  const summary = useMemo(() => ({
    count: rows.length,
    priced: priced.length,
    inBand: rows.filter((r) => r.rrp >= 12 && r.rrp <= 16).length,
    overBand: rows.filter((r) => r.rrp > 16).length,
    avgFoodlabGp: priced.length ? priced.reduce((s, r) => s + (r.foodlabGp ?? 0), 0) / priced.length : 0,
  }), [rows, priced])

  function exportCsv() {
    const head = ['Product', 'Code', 'Category', 'Classic', 'Serve (ml)', 'Price per litre', 'Price per serve', 'RRP inc VAT', 'Venue GP %']
    const lines = rows.map((r) => [
      `"${r.product.name}"`, r.product.productCode,
      `"${r.product.category ?? ''}"`, r.product.isClassic ? 'Yes' : '', r.servingMl,
      r.sellPerLitre.toFixed(2), r.sellPerServe.toFixed(2), r.rrp.toFixed(2), r.venueGp.toFixed(1),
    ].join(','))
    // Foodlab cost and Foodlab GP are deliberately absent — this file goes to clients.
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `foodlab-rate-card-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Header
        title="Rate card"
        subtitle="Our price, the menu price it supports, and the GP the venue keeps."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" onClick={tagTheTen} loading={busy} disabled={busy}>
              ★ Tag the ten classics
            </Button>
            <Button size="sm" onClick={exportCsv}>↓ Export for Alpine</Button>
          </div>
        }
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'Products', v: String(summary.count) },
          { k: 'Fully costed', v: `${summary.priced}/${summary.count}`, warn: summary.priced < summary.count },
          { k: 'Inside £12–16', v: String(summary.inBand) },
          { k: 'Above £16', v: String(summary.overBand), warn: summary.overBand > 0 },
          { k: 'Tagged classics', v: `${classicCount}/${CLASSIC_COCKTAILS.length}`, warn: classicCount < CLASSIC_COCKTAILS.length },
          { k: 'Avg Foodlab GP', v: `${summary.avgFoodlabGp.toFixed(0)}%` },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-4">
        {([
          ['all', `Everything ${products.filter(p => p.isActive !== false).length}`],
          ['classics', `Classics ${classicCount}`],
          ['core', 'Core range'],
        ] as const).map(([v, l]) => {
          const active = v === 'classics' ? classicsOnly : v === 'core' ? coreOnly : !classicsOnly && !coreOnly
          return (
            <button
              key={v}
              onClick={() => { setClassicsOnly(v === 'classics'); setCoreOnly(v === 'core') }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {l}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Target venue GP
          <input
            type="range" min={70} max={90} value={targetGp}
            onChange={(e) => setTargetGp(Number(e.target.value))}
            style={{ width: '150px' }}
          />
          <strong style={{ fontFamily: 'monospace', width: '38px' }}>{targetGp}%</strong>
        </label>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '7px' }}>
          VAT
          <input
            type="number" value={vat} onChange={(e) => setVat(Number(e.target.value) || 0)}
            style={{ width: '54px', padding: '4px 7px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }}
          />%
        </label>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '7px' }}>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
          >
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map((r) => (
                <Fragment key={r.product.id}>
                <tr style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ ...td, textAlign: 'center', padding: '10px 4px' }}>
                    <button
                      onClick={() => toggleClassic(r.product)}
                      disabled={busy}
                      title={r.product.isClassic ? 'Remove from the classics' : 'Tag as a classic'}
                      style={{
                        border: 'none', background: 'none', cursor: busy ? 'default' : 'pointer',
                        fontSize: '15px', lineHeight: 1, padding: '2px',
                        color: r.product.isClassic ? '#d97706' : '#e5e7eb',
                      }}
                    >★</button>
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{r.product.name}</span>
                    {!r.complete && (
                      <span title={r.missing.join(', ')} style={{ marginLeft: '7px', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', background: '#fef3c7', color: '#92400e' }}>
                        {r.missing.length} unpriced
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    {r.product.category
                      ? <span style={{ fontSize: '11.5px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#4b5563' }}>{r.product.category}</span>
                      : <span style={{ fontSize: '11px', color: '#d1d5db' }}>—</span>}
                  </td>
                  <td style={{ ...td, color: '#9ca3af' }}>{r.servingMl}ml</td>
                  <td style={td}>{r.sellPerLitre ? money(r.sellPerLitre) : '—'}</td>
                  <td style={td}>{r.sellPerServe ? money(r.sellPerServe) : '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: r.rrp > 16 ? '#b45309' : '#111827' }}>
                    {r.rrp ? money(r.rrp) : '—'}
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: r.venueGp >= 80 ? '#f0fdf4' : r.venueGp >= 70 ? '#fefce8' : '#fef2f2',
                      color: r.venueGp >= 80 ? '#166534' : r.venueGp >= 70 ? '#854d0e' : '#991b1b',
                    }}>{r.venueGp ? r.venueGp.toFixed(0) + '%' : '—'}</span>
                  </td>
                  <td style={{ ...td, borderLeft: '1px solid #f3f4f6', color: '#6b7280' }}>
                    {r.costPerServe !== null ? (
                      <button
                        onClick={() => setOpenId(openId === r.product.id ? null : r.product.id)}
                        title="Show what makes up this cost"
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                          font: 'inherit', fontVariantNumeric: 'tabular-nums',
                          color: r.costPerServe > r.sellPerServe ? '#b91c1c' : '#6b7280',
                          fontWeight: r.costPerServe > r.sellPerServe ? 700 : 400,
                          borderBottom: '1px dotted #d1d5db',
                        }}
                      >
                        {money(r2(r.costPerServe))}
                      </button>
                    ) : '—'}
                  </td>
                  <td style={{ ...td, color: r.foodlabGp !== null && r.foodlabGp < 0 ? '#b91c1c' : '#6b7280', fontWeight: r.foodlabGp !== null && r.foodlabGp < 0 ? 700 : 400 }}>
                    {r.foodlabGp !== null ? r.foodlabGp.toFixed(0) + '%' : '—'}
                  </td>
                </tr>
                {openId === r.product.id && (
                  <tr key={r.product.id + '-breakdown'}>
                    <td colSpan={10} style={{ padding: 0, background: '#fbfbfc', borderBottom: '1px solid #f3f4f6' }}>
                      <CostBreakdown lines={r.lines} costPerLitre={r.costPerLitre} servingMl={r.servingMl} />
                    </td>
                  </tr>
                )}
              </Fragment>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '36px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
                  No products match. Try turning off &ldquo;core range only&rdquo;.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '14px', lineHeight: 1.6, maxWidth: '760px' }}>
        The last two columns are <strong style={{ color: '#6b7280' }}>internal only</strong> — cost to make and Foodlab GP
        are left out of the export, which carries our price, the RRP and the venue&apos;s GP alone.
        RRP rounds to the nearest 50p. Anything above £16 sits outside Mark&apos;s band and needs a ruling.
      </p>
    </div>
  )
}
