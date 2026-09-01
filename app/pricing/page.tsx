'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { splitRecipeCost, priceDrink, PricingInputs, PriceMode, isAlcoholicIngredient } from '@/lib/pricing'
import { computeRecipeCost, findIngredientMatch, matchIngredient } from '@/lib/costing'
import { SWAPS } from '@/lib/data/swaps'
import { useTable, ColumnDef } from '@/hooks/useTable'
import { Product, Recipe, Ingredient } from '@/types'

const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '18px 20px',
}

function money(n: number) { return '£' + n.toFixed(2) }

type Format = 'premix' | 'syrup'

interface Row {
  product: Product
  recipe: Recipe
  servingMl: number
  menuPrice: number
  spiritPerServe: number
  ourCost: number
  ourPrice: number
  ourGp: number
  venueGp: number
  ourCeiling: number
  ourFloor: number
  works: boolean
  menuNeeded: number
  complete: boolean
}

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'drink',  label: 'Drink',        width: 210, sortValue: (r) => r.product.name },
  { key: 'serve',  label: 'Serve',        width: 78,  align: 'right', sortValue: (r) => r.servingMl, descFirst: true },
  { key: 'menu',   label: 'Menu price',   width: 108, align: 'right', sortValue: (r) => r.menuPrice, descFirst: true },
  { key: 'spirit', label: 'Their spirit', width: 106, align: 'right', sortValue: (r) => r.spiritPerServe, descFirst: true },
  { key: 'price',  label: 'We charge',    width: 104, align: 'right', sortValue: (r) => r.ourPrice, descFirst: true },
  { key: 'cost',   label: 'Costs us',     width: 96,  align: 'right', sortValue: (r) => r.ourCost, descFirst: true },
  { key: 'vgp',    label: 'Venue GP',     width: 96,  align: 'right', sortValue: (r) => r.venueGp, descFirst: true },
  { key: 'gp',     label: 'Our GP',       width: 92,  align: 'right', sortValue: (r) => r.ourGp, descFirst: true },
  { key: 'needed', label: 'Menu needed',  width: 116, align: 'right', sortValue: (r) => r.menuNeeded, descFirst: true },
  { key: 'verdict',label: 'Verdict',      width: 110, sortValue: (r) => (r.works ? 0 : 1) },
]

/**
 * Why a drink's margin is what it is, and what would move it.
 *
 * A red percentage on its own is an accusation, not information. This names the
 * line carrying the cost, whether it is spirit the venue could buy instead, what
 * the contract swaps would do to it, and the two prices that would fix it.
 */
function WhyPanel({ row, ingredients, targetGp, vat, venueGp }: {
  row: Row
  ingredients: Ingredient[]
  targetGp: number
  vat: number
  venueGp: number
}) {
  const cost = computeRecipeCost(row.recipe, ingredients)
  const per = row.servingMl / 1000

  const lines = cost.lines
    .filter((l) => (l.costPer1L ?? 0) > 0)
    .map((l) => {
      const ing = matchIngredient({ name: l.name, ingredientId: l.ingredientId }, ingredients)
      const swap = SWAPS.find((sw) => findIngredientMatch(sw.from, ing ? [ing] : []))
      const perServe = (l.costPer1L ?? 0) * per
      const afterSwap = swap && swap.fromPrice > 0 ? perServe * (swap.toPrice / swap.fromPrice) : perServe
      return {
        name: l.name,
        perServe,
        share: cost.costPerLitre > 0 ? ((l.costPer1L ?? 0) / cost.costPerLitre) * 100 : 0,
        alcoholic: isAlcoholicIngredient(ing, l.name),
        swap, afterSwap, saving: perServe - afterSwap,
      }
    })
    .sort((a, b) => b.perServe - a.perServe)

  const withSwaps = lines.reduce((s, l) => s + l.afterSwap, 0)
  const swapSaving = row.ourCost - withSwaps
  const gpAfterSwaps = row.ourPrice > 0 ? ((row.ourPrice - withSwaps) / row.ourPrice) * 100 : 0
  const spiritShare = lines.filter((l) => l.alcoholic).reduce((s, l) => s + l.share, 0)

  // The two ways out: charge more, or cost less.
  const priceToHit = targetGp < 100 ? row.ourCost / (1 - targetGp / 100) : Infinity
  const menuToHit = (priceToHit / (1 - venueGp / 100)) * (1 + vat / 100)

  const box: React.CSSProperties = { background: '#fff', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px' }
  const h: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 9px' }

  return (
    <div style={{ padding: '16px 20px 20px', display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '14px' }}>

      <div style={box}>
        <p style={h}>Where the cost goes, per {row.servingMl}ml serve</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.name + i}>
                <td style={{ padding: '5px 10px 5px 0', color: l.share > 50 ? '#991b1b' : '#374151', fontWeight: l.share > 50 ? 700 : 400 }}>
                  {l.name}
                  {l.alcoholic && <span style={{ marginLeft: '6px', fontSize: '9.5px', fontWeight: 700, color: '#b45309' }}>SPIRIT</span>}
                </td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6b7280' }}>{money(l.perServe)}</td>
                <td style={{ padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: l.share > 50 ? '#991b1b' : '#9ca3af', width: '44px' }}>
                  {l.share.toFixed(0)}%
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: '8px 10px 0 0', borderTop: '1px solid #f3f4f6', fontWeight: 700 }}>Cost per serve</td>
              <td style={{ padding: '8px 10px 0', borderTop: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(row.ourCost)}</td>
              <td style={{ borderTop: '1px solid #f3f4f6' }} />
            </tr>
          </tbody>
        </table>
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
          <strong>{spiritShare.toFixed(0)}% of this drink is spirit.</strong>{' '}
          {spiritShare > 60
            ? 'That is the whole problem — there is no recipe change that gets round the base pour.'
            : 'Low enough that the recipe, not the spirit, is where the money is.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={box}>
          <p style={h}>What would fix it</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ color: '#6b7280' }}>Charge {money(priceToHit)} instead of {money(row.ourPrice)}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{targetGp}% for us</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ color: '#6b7280' }}>…which needs a menu price of</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: menuToHit > 16 ? '#b45309' : '#166534' }}>
                {money(menuToHit)}
              </span>
            </div>
            {swapSaving > 0.005 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280' }}>…or take the contract swaps</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#166534' }}>
                  {money(withSwaps)} · {gpAfterSwaps.toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {lines.some((l) => l.swap) && (
          <div style={box}>
            <p style={h}>Swaps on this drink</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {lines.filter((l) => l.swap).map((l) => (
                <div key={l.name} style={{ fontSize: '12.5px', lineHeight: 1.45 }}>
                  <span style={{ color: '#374151' }}>{l.swap!.from} → <strong>{l.swap!.to}</strong></span>
                  <span style={{
                    marginLeft: '7px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: l.saving > 0 ? '#166534' : '#b91c1c',
                  }}>
                    {l.saving > 0 ? '−' : '+'}{money(Math.abs(l.saving))}
                  </span>
                  <span style={{
                    marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px',
                    background: l.swap!.verdict === 'mandated' ? '#dcfce7' : l.swap!.verdict === 'refuse' ? '#fee2e2' : '#fef3c7',
                    color: l.swap!.verdict === 'mandated' ? '#166534' : l.swap!.verdict === 'refuse' ? '#991b1b' : '#92400e',
                  }}>
                    {l.swap!.verdict === 'mandated' ? 'take it' : l.swap!.verdict === 'refuse' ? 'refuse' : 'tasting'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          <Link href={`/recipes/${row.recipe.id}`}><Button size="sm" variant="secondary">Open the recipe</Button></Link>
          <Link href="/swaps"><Button size="sm" variant="secondary">All swaps</Button></Link>
          <Link href="/lwc"><Button size="sm" variant="secondary">Fix prices</Button></Link>
        </div>
      </div>
    </div>
  )
}

export default function PricingPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  const [format, setFormat] = useState<Format>('premix')
  const [venueGp, setVenueGp] = useState(80)
  const [ourGp, setOurGp] = useState(30)
  const [vat, setVat] = useState(20)
  const [classicsOnly, setClassicsOnly] = useState(true)
  const [mode, setMode] = useState<PriceMode>('venue')
  // Menu price per drink, so you can play with one without moving the rest.
  const [menu, setMenu] = useState<Record<string, string>>({})
  const [defaultMenu, setDefaultMenu] = useState('13')
  const [openId, setOpenId] = useState<string | null>(null)

  const cols = useTable<Row>('pricing', COLUMNS)

  useEffect(() => {
    Promise.all([getProducts(), getRecipes(), getIngredients()])
      .then(([p, r, i]) => { setProducts(p); setRecipes(r); setIngredients(i) })
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo<Row[]>(() => {
    return products
      .filter((p) => p.isActive !== false)
      .filter((p) => (classicsOnly ? p.isClassic : true))
      .map((p) => {
        const recipe = recipes.find((r) => r.productId === p.id)
        const servingMl = p.recommendedServingG || 100
        const menuPrice = parseFloat(menu[p.id] ?? defaultMenu) || 0
        if (!recipe) return null

        const split = splitRecipeCost(recipe, ingredients)
        const inputs: PricingInputs = {
          menuPrice, vatRate: vat / 100,
          venueGpTarget: venueGp / 100, ourGpTarget: ourGp / 100, servingMl, mode,
        }
        const priced = priceDrink(split, inputs)
        const f = format === 'premix' ? priced.premix : priced.syrup

        return {
          product: p, recipe, servingMl, menuPrice,
          spiritPerServe: format === 'syrup' ? priced.spiritPerServe : 0,
          ourCost: f.ourCost, ourPrice: f.ourPrice, ourGp: f.ourGpPercent,
          venueGp: f.venueGpPercent, ourCeiling: f.ourCeiling,
          ourFloor: f.ourFloor, works: f.works, menuNeeded: f.menuPriceNeeded,
          complete: split.complete,
        }
      })
      .filter((r): r is Row => r !== null)
  }, [products, recipes, ingredients, format, venueGp, ourGp, vat, classicsOnly, menu, defaultMenu, mode])

  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.works)
    return {
      total: rows.length,
      ok: ok.length,
      blended: (() => {
        const rev = rows.reduce((s, r) => s + r.ourPrice, 0)
        const cost = rows.reduce((s, r) => s + r.ourCost, 0)
        return rev > 0 ? ((rev - cost) / rev) * 100 : 0
      })(),
      losers: rows.filter((r) => r.ourGp < 0).length,
      worst: rows.filter((r) => !r.works).sort((a, b) => b.menuNeeded - a.menuNeeded)[0],
      incomplete: rows.filter((r) => !r.complete).length,
    }
  }, [rows])

  function exportCsv() {
    const head = [
      'Drink', 'Format', 'Serve (ml)', 'Menu price inc VAT',
      format === 'syrup' ? 'Venue spirit cost' : 'Venue buys spirit',
      'Our price per serve', 'Venue GP achieved %', 'Menu price needed', 'Holds?',
    ]
    const lines = rows.map((r) => [
      `"${r.product.name}"`, format === 'syrup' ? 'Syrup' : 'Pre-mix', r.servingMl,
      r.menuPrice.toFixed(2), format === 'syrup' ? r.spiritPerServe.toFixed(2) : 'n/a',
      r.ourPrice.toFixed(2), r.venueGp.toFixed(1), r.menuNeeded.toFixed(2), r.works ? 'Yes' : 'No',
    ].join(','))
    // Our cost and our GP stay out — this file is for a client.
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `foodlab-${format}-pricing-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Header
        title="Pricing finalizer"
        subtitle="What we charge so the venue keeps its GP and we still make money — on both formats."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/range"><Button size="sm" variant="ghost">Change the range</Button></Link>
            <Link href="/pricing/alcohol"><Button size="sm" variant="secondary">Mark the spirits</Button></Link>
            <Button size="sm" onClick={exportCsv}>↓ Export this scenario</Button>
          </div>
        }
      />

      {/* format switch */}
      <div className="flex gap-1 mb-4">
        {([['premix', 'Pre-mix — we supply the spirit'], ['syrup', 'Syrup — they pour their own']] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFormat(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              format === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div style={{ ...card, marginBottom: '16px' }}>
        <p style={{ margin: '0 0 10px', fontSize: '13.5px', lineHeight: 1.6, color: '#4b5563', maxWidth: '82ch' }}>
          <strong style={{ color: '#111827' }}>Read the blended figure, not the verdicts.</strong> Every drink is priced
          at the same £{(parseFloat(defaultMenu) || 0).toFixed(2)} here, which no menu actually does — a Dry Martini is
          not the same price as a G&amp;T. Put the real menu price on each row and the picture changes. The verdict column
          only asks whether one drink clears your floor at its own price.
        </p>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.6, color: '#4b5563', maxWidth: '82ch' }}>
          {format === 'premix' ? (
            <>We supply the finished drink and the venue pays us once, so their whole budget comes to us.
            <strong style={{ color: '#111827' }}> Our price is whatever leaves them their target GP</strong>, and the
            question is only whether that covers our cost with margin left.</>
          ) : (
            <>The venue pours its own spirit, so <strong style={{ color: '#111827' }}>it comes out of their budget before
            we get paid</strong> — priced here at what the same spirit costs us, since they buy comparably. What is left is
            the most we can charge for the syrup. On spirit-heavy drinks that remainder can be smaller than our cost to
            make it, which is the whole reason a target GP that works on pre-mix can be impossible on syrup.</>
          )}
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'Drinks priced', v: String(summary.total) },
          { k: 'Both targets hold', v: `${summary.ok}/${summary.total}`, warn: summary.ok < summary.total },
          { k: 'Blended GP, this scenario', v: `${summary.blended.toFixed(0)}%`, warn: summary.blended < 40 },
          { k: 'Losing money', v: String(summary.losers), warn: summary.losers > 0 },
          { k: 'Hardest drink', v: summary.worst ? `£${summary.worst.menuNeeded.toFixed(2)}` : '—', warn: !!summary.worst },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* the levers */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>When both cannot hold —</span>
        {([
          ['venue', 'Protect their GP'],
          ['ours',  'Protect ours'],
          ['split', 'Split the gap'],
        ] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setMode(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >{l}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Venue GP
          <input type="range" min={60} max={90} value={venueGp} onChange={(e) => setVenueGp(Number(e.target.value))} style={{ width: '120px' }} />
          <strong style={{ fontFamily: 'monospace', width: '38px' }}>{venueGp}%</strong>
        </label>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Our GP floor
          <input type="range" min={0} max={90} value={ourGp} onChange={(e) => setOurGp(Number(e.target.value))} style={{ width: '120px' }} />
          <strong style={{ fontFamily: 'monospace', width: '38px' }}>{ourGp}%</strong>
        </label>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Menu price
          <input
            value={defaultMenu}
            onChange={(e) => setDefaultMenu(e.target.value.replace(/[^0-9.]/g, ''))}
            style={{ width: '62px', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', textAlign: 'right', fontFamily: 'monospace' }}
          />
        </label>
        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
          VAT
          <input type="number" value={vat} onChange={(e) => setVat(Number(e.target.value) || 0)}
            style={{ width: '52px', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />%
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={classicsOnly} onChange={(e) => setClassicsOnly(e.target.checked)} />
          Core classics only
        </label>
        <cols.ResetButton />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
            No costed drinks here. Set the range up on Core classics, or turn the filter off.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map((r) => (
                <Fragment key={r.product.id}>
                <tr
                  onClick={() => setOpenId(openId === r.product.id ? null : r.product.id)}
                  title="Why this margin, and what would move it"
                  style={{
                    borderBottom: '1px solid #f9fafb', cursor: 'pointer',
                    background: openId === r.product.id ? '#f9fafb' : r.works ? undefined : '#fffbf7',
                  }}
                >
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#111827' }}>
                    {r.product.name}
                    {!r.complete && (
                      <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', background: '#fef3c7', color: '#92400e' }}>
                        part-costed
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, color: '#9ca3af' }}>{r.servingMl}ml</td>
                  <td style={td}>
                    <input
                      value={menu[r.product.id] ?? defaultMenu}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setMenu({ ...menu, [r.product.id]: e.target.value.replace(/[^0-9.]/g, '') })}
                      style={{
                        width: '100%', padding: '3px 6px', border: '1px solid transparent', borderRadius: '6px',
                        fontSize: '13px', textAlign: 'right', fontFamily: 'monospace', outline: 'none', background: 'transparent',
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.background = '#fff' }}
                      onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                    />
                  </td>
                  <td style={{ ...td, color: '#9ca3af' }}>
                    {format === 'syrup' ? money(r.spiritPerServe) : '—'}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: r.works ? '#111827' : '#b45309' }}>{money(r.ourPrice)}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{money(r.ourCost)}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: r.venueGp >= venueGp ? '#f0fdf4' : r.venueGp >= venueGp - 10 ? '#fefce8' : '#fef2f2',
                      color: r.venueGp >= venueGp ? '#166534' : r.venueGp >= venueGp - 10 ? '#854d0e' : '#991b1b',
                    }}>{r.venueGp.toFixed(0)}%</span>
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: r.ourGp >= ourGp ? '#f0fdf4' : r.ourGp > 0 ? '#fefce8' : '#fef2f2',
                      color: r.ourGp >= ourGp ? '#166534' : r.ourGp > 0 ? '#854d0e' : '#991b1b',
                    }}>{r.ourGp.toFixed(0)}%</span>
                  </td>
                  <td style={{ ...td, fontWeight: r.works ? 400 : 700, color: r.works ? '#9ca3af' : '#b45309' }}>
                    {money(r.menuNeeded)}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: r.works ? '#dcfce7' : '#ffedd5',
                      color: r.works ? '#166534' : '#c2410c',
                    }}>{r.works ? 'Holds' : 'Needs more'}</span>
                  </td>
                </tr>
                {openId === r.product.id && (
                  <tr>
                    <td colSpan={11} style={{ padding: 0, background: '#fbfbfc', borderBottom: '1px solid #f3f4f6' }}>
                      <WhyPanel row={r} ingredients={ingredients} targetGp={ourGp} vat={vat} venueGp={venueGp} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '14px', lineHeight: 1.6, maxWidth: '82ch' }}>
        <strong style={{ color: '#6b7280' }}>Menu needed</strong> is the price at which both targets hold at once —
        the venue keeps its GP and we clear our floor. Where a drink says <em>Needs more</em>, that is the number to
        take to the tasting: either the menu price moves, one of the two targets gives, or the recipe does.
        The export carries our price and the menu price, never our cost or our GP.
      </p>
    </div>
  )
}
