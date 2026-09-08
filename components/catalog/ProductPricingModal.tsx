'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { getAllPricing, upsertAccountPricing, deleteAccountPricing, updateProduct } from '@/lib/firestore/catalog'
import { getAccounts } from '@/lib/firestore/accounts'
import { getRecipes } from '@/lib/firestore/recipes'
import { getAllOrders } from '@/lib/firestore/orders'
import { getIngredients } from '@/lib/firestore/ingredients'
import { computeRecipeCost } from '@/lib/costing'
import { Product, Account, AccountPricing, Recipe, Ingredient, Order } from '@/types'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

interface Props {
  product: Product
  onClose: () => void
}

const VOLUMES = [5, 10, 19]

const label: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: '7px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}
const td: React.CSSProperties = {
  padding: '9px 10px', fontSize: '13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151',
}
const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', whiteSpace: 'nowrap',
}

function money(n: number) { return '£' + n.toFixed(2) }

export default function ProductPricingModal({ product, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [classic, setClassic] = useState(!!product.isClassic)
  const [flipping, setFlipping] = useState(false)

  // new row
  const [accountId, setAccountId] = useState('')
  const [volume, setVolume] = useState(5)
  const [perLitre, setPerLitre] = useState('')
  const [rrp, setRrp] = useState('')

  function load() {
    Promise.all([getAccounts(), getAllPricing(), getRecipes(), getIngredients(), getAllOrders()])
      .then(([a, p, r, i, o]) => {
        setAccounts(a)
        setPricing(p.filter((x) => x.productId === product.id))
        setRecipes(r)
        setIngredients(i)
        setOrders(o)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [product.id])   // eslint-disable-line react-hooks/exhaustive-deps

  // Cost comes straight off the recipe, so a price typed here is judged against
  // what the drink actually costs today rather than a number someone remembered.
  const cost = useMemo(() => {
    const recipe = recipes.find((r) => r.productId === product.id)
    if (!recipe) return null
    const c = computeRecipeCost(recipe, ingredients)
    const serve = product.recommendedServingG || 100
    return {
      perLitre: c.costPerLitre,
      perServe: (c.costPerLitre * serve) / 1000,
      complete: c.complete,
      missing: c.missingIngredients,
      serve,
    }
  }, [recipes, ingredients, product])

  // The spec, read here rather than on its own page — this is where you land
  // when you click a drink, so this is where the recipe has to be.
  const specs = useMemo(
    () => recipes.filter((r) => r.productId === product.id),
    [recipes, product.id]
  )

  async function toggleClassic() {
    const next = !classic
    setFlipping(true)
    try {
      await updateProduct(product.id, { isClassic: next })
      setClassic(next)
      toast.success(next ? `${product.name} added to the core classics` : `${product.name} removed from the core classics`)
    } catch {
      toast.error('Could not save')
    } finally { setFlipping(false) }
  }

  // Every real order this drink has appeared on, newest first. R&D and cancelled
  // orders are left out — they are not sales.
  const sales = useMemo(() => {
    const rows = orders
      .filter((o) => o.status !== 'cancelled' && o.type !== 'rd')
      .flatMap((o) =>
        o.lineItems
          .filter((li) => li.productId === product.id)
          .map((li) => ({
            date: o.createdAt,
            account: o.accountName,
            litres: li.quantity * (li.volumeLitres ?? 5),
            value: li.lineTotal,
            orderId: o.id,
            orderNumber: o.orderNumber,
          }))
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime())
    return {
      rows,
      last: rows[0],
      litres: rows.reduce((s, r) => s + r.litres, 0),
      value: rows.reduce((s, r) => s + r.value, 0),
      accounts: new Set(rows.map((r) => r.account)).size,
    }
  }, [orders, product.id])

  const priced = new Set(pricing.map((p) => p.accountId))
  const available = accounts.filter((a) => !priced.has(a.id))

  // Live preview of the row being typed.
  const draft = useMemo(() => {
    const pl = parseFloat(perLitre) || 0
    const r = parseFloat(rrp) || 0
    const perUnit = pl * volume
    const rrpExVat = r / 1.2
    const perServe = (pl * (product.recommendedServingG || 100)) / 1000
    return {
      perUnit,
      venueGp: rrpExVat > 0 ? ((rrpExVat - perServe) / rrpExVat) * 100 : 0,
      foodlabGp: pl > 0 && cost ? ((pl - cost.perLitre) / pl) * 100 : null,
      perServe,
    }
  }, [perLitre, rrp, volume, product, cost])

  async function add() {
    const acc = accounts.find((a) => a.id === accountId)
    const pl = parseFloat(perLitre)
    const r = parseFloat(rrp)
    if (!acc || !(pl > 0)) return toast.error('Pick a venue and a price per litre')

    setSaving(true)
    try {
      await upsertAccountPricing({
        accountId: acc.id,
        accountName: acc.tradingName || acc.legalName,
        groupId: acc.groupId,
        groupName: acc.groupName,
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        volumeLitres: volume,
        recommendedServingG: product.recommendedServingG || 100,
        pricePerUnit: pl * volume,
        pricePerLitre: pl,
        rrp: r || 0,
        venueGpPercent: 0,          // derived on write
        foodlabGpPercent: draft.foodlabGp ?? 0,
      })
      toast.success(`${acc.tradingName || acc.legalName} priced`)
      setAccountId(''); setPerLitre(''); setRrp('')
      load()
    } catch {
      toast.error('Could not save')
    } finally { setSaving(false) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '860px', padding: '24px 26px 26px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>{product.name}</h2>
            <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
              {product.productCode} · {product.recommendedServingG || 100}ml serve
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={toggleClassic}
              disabled={flipping}
              style={{
                border: `1px solid ${classic ? '#bbf7d0' : '#e5e7eb'}`,
                background: classic ? '#f0fdf4' : '#fff',
                color: classic ? '#166534' : '#6b7280',
                borderRadius: '20px', padding: '6px 13px', fontSize: '12px', fontWeight: 600,
                cursor: flipping ? 'default' : 'pointer', whiteSpace: 'nowrap',
              }}
              title={classic ? 'Click to take it back out of the core range' : 'Adds it to the core range and to product development'}
            >
              {classic ? '✓ Core classic' : '+ Add to core classics'}
            </button>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#d1d5db' }}>×</button>
          </div>
        </div>

        {/* live cost */}
        <div style={{
          background: cost?.complete ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${cost?.complete ? '#bbf7d0' : '#fde68a'}`,
          borderRadius: '10px', padding: '13px 16px', marginBottom: '18px',
        }}>
          {cost === null ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#92400e' }}>
              No recipe linked, so there is nothing to cost this against yet.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>
                <strong style={{ fontSize: '19px', fontWeight: 700, color: cost.complete ? '#166534' : '#92400e' }}>
                  {money(cost.perLitre)}
                </strong>
                <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '5px' }}>costs us / litre</span>
              </span>
              <span>
                <strong style={{ fontSize: '15px', fontWeight: 700, color: '#374151' }}>{money(cost.perServe)}</strong>
                <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '5px' }}>/ {cost.serve}ml serve</span>
              </span>
              {!cost.complete && (
                <span style={{ fontSize: '12px', color: '#92400e' }}>
                  Unpriced: {cost.missing.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* the recipe, in the same view */}
        <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Recipe
            </p>
            {specs.length > 0 && (
              <Link href={`/recipes/${specs[0].id}`} style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: 600 }}>
                Edit the spec →
              </Link>
            )}
          </div>

          {loading ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>Loading…</p>
          ) : specs.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#b45309' }}>
              No recipe linked to this drink yet, so nothing here can be costed.
            </p>
          ) : (
            specs.map((r, ri) => {
              const c = computeRecipeCost(r, ingredients)
              return (
                <div key={r.id} style={{ marginTop: ri ? '16px' : 0, paddingTop: ri ? '14px' : 0, borderTop: ri ? '1px solid #f3f4f6' : 'none' }}>
                  {specs.length > 1 && (
                    <p style={{ margin: '0 0 8px', fontSize: '12.5px', fontWeight: 600, color: '#374151' }}>
                      {r.name}{r.variation ? ` · ${r.variation}` : ''}
                    </p>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <tbody>
                      {r.ingredients.map((row, i) => {
                        const line = c.lines[i]
                        return (
                          <tr key={row.name + i} style={{ borderTop: i ? '1px solid #fafafa' : 'none' }}>
                            <td style={{ padding: '5px 10px 5px 0', color: '#374151' }}>{row.name}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {row.qtyPer1L.toFixed(row.qtyPer1L < 1 ? 3 : 1)} {row.unit}
                            </td>
                            <td style={{ padding: '5px 0', textAlign: 'right', width: '78px', fontVariantNumeric: 'tabular-nums', color: line?.costPer1L == null ? '#d1d5db' : '#6b7280' }}>
                              {line?.costPer1L == null ? 'no price' : money(line.costPer1L)}
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '7px 10px 0 0', fontWeight: 600, color: '#111827' }}>Per litre</td>
                        <td />
                        <td style={{ padding: '7px 0 0', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.complete ? '#111827' : '#b45309' }}>
                          {money(c.costPerLitre)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {r.cookingInstructions && (
                    <p style={{ margin: '10px 0 0', fontSize: '12.5px', color: '#6b7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {r.cookingInstructions}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* when it last sold */}
        <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
            Sales
          </p>
          {!sales.last ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>Never ordered.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <span>
                  <strong style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
                    {formatDistanceToNow(sales.last.date, { addSuffix: true }).replace('about ', '')}
                  </strong>
                  <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '6px' }}>
                    last sold, to {sales.last.account}
                  </span>
                </span>
                <span style={{ fontSize: '12.5px', color: '#6b7280' }}>
                  <strong style={{ color: '#111827' }}>{sales.rows.length}</strong> order lines ·{' '}
                  <strong style={{ color: '#111827' }}>{Math.round(sales.litres)}L</strong> ·{' '}
                  <strong style={{ color: '#111827' }}>{money(sales.value)}</strong> ·{' '}
                  {sales.accounts} venue{sales.accounts === 1 ? '' : 's'}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <tbody>
                  {sales.rows.slice(0, 6).map((r, i) => (
                    <tr key={r.orderId + i} style={{ borderTop: i ? '1px solid #fafafa' : 'none' }}>
                      <td style={{ padding: '5px 10px 5px 0', color: '#6b7280', fontFamily: 'monospace', fontSize: '11.5px' }}>
                        {format(r.date, 'd MMM yyyy')}
                      </td>
                      <td style={{ padding: '5px 10px', color: '#374151' }}>{r.account}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{r.litres}L</td>
                      <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sales.rows.length > 6 && (
                <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: '#9ca3af' }}>
                  and {sales.rows.length - 6} more
                </p>
              )}
            </>
          )}
        </div>

        {/* existing venue prices */}
        {loading ? (
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading…</p>
        ) : (
          <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflowX: 'auto', marginBottom: '18px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Venue</th>
                  <th style={th}>Pack</th>
                  <th style={th}>£ / litre</th>
                  <th style={th}>£ / pack</th>
                  <th style={th}>RRP</th>
                  <th style={th}>Venue GP</th>
                  <th style={th}>Our GP</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {pricing.map((p) => {
                  const ourGp = cost && p.pricePerLitre > 0
                    ? ((p.pricePerLitre - cost.perLitre) / p.pricePerLitre) * 100
                    : null
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#111827' }}>{p.accountName}</td>
                      <td style={{ ...td, color: '#9ca3af' }}>{p.volumeLitres}L</td>
                      <td style={td}>{money(p.pricePerLitre)}</td>
                      <td style={td}>{money(p.pricePerUnit)}</td>
                      <td style={td}>{p.rrp ? money(p.rrp) : '—'}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                          background: p.venueGpPercent >= 75 ? '#f0fdf4' : '#fef3c7',
                          color: p.venueGpPercent >= 75 ? '#166534' : '#92400e',
                        }}>{p.venueGpPercent.toFixed(0)}%</span>
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: ourGp === null ? '#d1d5db' : ourGp < 0 ? '#b91c1c' : '#374151' }}>
                        {ourGp === null ? '—' : ourGp.toFixed(0) + '%'}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button
                          onClick={async () => {
                            if (!confirm(`Remove pricing for ${p.accountName}?`)) return
                            await deleteAccountPricing(p.id)
                            load()
                          }}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '15px' }}
                        >×</button>
                      </td>
                    </tr>
                  )
                })}
                {pricing.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '22px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
                    Not priced for any venue yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* add a venue */}
        <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', padding: '16px 18px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
            Price it for a venue
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
            <div>
              <span style={label}>Venue</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">Pick one…</option>
                {available.map((a) => (
                  <option key={a.id} value={a.id}>{a.tradingName || a.legalName}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={label}>Pack</span>
              <select value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                {VOLUMES.map((v) => <option key={v} value={v}>{v}L</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Our £ / litre</span>
              <input value={perLitre} onChange={(e) => setPerLitre(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal" style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }} />
            </div>
            <div>
              <span style={label}>Their RRP</span>
              <input value={rrp} onChange={(e) => setRrp(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal" style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }} />
            </div>
            <Button onClick={add} loading={saving} disabled={saving || !accountId || !perLitre}>Add</Button>
          </div>

          {parseFloat(perLitre) > 0 && (
            <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f3f4f6', fontSize: '12.5px' }}>
              <span style={{ color: '#6b7280' }}>
                {money(draft.perUnit)} per {volume}L pack
              </span>
              <span style={{ color: '#6b7280' }}>
                {money(draft.perServe)} a serve to them
              </span>
              {parseFloat(rrp) > 0 && (
                <span style={{ color: draft.venueGp >= 75 ? '#166534' : '#b45309', fontWeight: 600 }}>
                  Venue GP {draft.venueGp.toFixed(0)}%
                </span>
              )}
              {draft.foodlabGp !== null && (
                <span style={{ color: draft.foodlabGp < 0 ? '#b91c1c' : draft.foodlabGp < 40 ? '#b45309' : '#166534', fontWeight: 700 }}>
                  Our GP {draft.foodlabGp.toFixed(0)}%
                </span>
              )}
            </div>
          )}
        </div>

        <p style={{ fontSize: '11.5px', color: '#9ca3af', margin: '14px 0 0', lineHeight: 1.55 }}>
          Venue GP is worked out on the RRP net of VAT, so it is the margin they actually keep. Our GP is against the
          live recipe cost above — change an ingredient price and this moves with it.
        </p>
      </div>
    </div>
  )
}
