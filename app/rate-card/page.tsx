'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts, updateProduct } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { computeRecipeCost } from '@/lib/costing'
import { Product, Recipe, Ingredient, CLASSIC_COCKTAILS, matchesClassic } from '@/types'

const th: React.CSSProperties = {
  padding: '9px 12px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

function r2(n: number) { return Math.round(n * 100) / 100 }
function money(n: number) { return '£' + n.toFixed(2) }

// Menu prices land on a psychological price point, not a raw calculation.
function toMenuPrice(n: number): number {
  return Math.max(0, Math.round(n * 2) / 2)
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
        }
      })
      .sort((a, b) => b.rrp - a.rrp)
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
          <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                <th style={{ ...th, width: '34px', textAlign: 'center' }}>★</th>
                <th style={{ ...th, textAlign: 'left' }}>Product</th>
                <th style={{ ...th, textAlign: 'left' }}>Category</th>
                <th style={th}>Serve</th>
                <th style={th}>Our £/L</th>
                <th style={th}>Our £/serve</th>
                <th style={th}>RRP</th>
                <th style={th}>Venue GP</th>
                <th style={{ ...th, borderLeft: '1px solid #f3f4f6' }}>Cost/serve</th>
                <th style={th}>Foodlab GP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} style={{ borderBottom: '1px solid #f9fafb' }}>
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
                    {r.costPerServe !== null ? money(r2(r.costPerServe)) : '—'}
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>
                    {r.foodlabGp !== null ? r.foodlabGp.toFixed(0) + '%' : '—'}
                  </td>
                </tr>
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
