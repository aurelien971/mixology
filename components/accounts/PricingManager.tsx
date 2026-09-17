'use client'

import { useEffect, useState } from 'react'
import { getProducts, getPricingForAccount, deleteAccountPricing } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { liveCost } from '@/lib/liveCost'
import { useTable, ColumnDef } from '@/hooks/useTable'
import PriceForm, { priceMetrics, GpBadge } from '@/components/accounts/PriceForm'
import { Product, AccountPricing, Recipe, Ingredient } from '@/types'
import toast from 'react-hot-toast'

interface Props {
  accountId: string
  accountName: string
  groupId?: string
  groupName?: string
  onPricingChange?: (pricing: AccountPricing[]) => void
}

interface Row {
  p: AccountPricing
  ppl: number
  perServe: number
  costPerServe: number | null
  venueGp: number | null
  ourGp: number | null
}

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'product', label: 'Product',       width: 220, sortValue: (r) => r.p.productName },
  { key: 'pack',    label: 'Pack',          width: 64,  align: 'right', sortValue: (r) => r.p.volumeLitres },
  { key: 'serve',   label: 'Serve',         width: 70,  align: 'right', sortValue: (r) => r.p.recommendedServingG },
  { key: 'ppl',     label: 'Price / L',     width: 90,  align: 'right', sortValue: (r) => r.ppl, descFirst: true },
  { key: 'serveP',  label: 'Price / serve', width: 100, align: 'right', sortValue: (r) => r.perServe, descFirst: true },
  { key: 'rsp',     label: 'RSP',           width: 80,  align: 'right', sortValue: (r) => r.p.rrp || null, descFirst: true },
  { key: 'cost',    label: 'Cost / serve',  width: 96,  align: 'right', sortValue: (r) => r.costPerServe, descFirst: true },
  { key: 'venueGp', label: 'Venue GP',      width: 92,  align: 'right', sortValue: (r) => r.venueGp, descFirst: true },
  { key: 'ourGp',   label: 'Our GP',        width: 92,  align: 'right', sortValue: (r) => r.ourGp, descFirst: true },
  { key: 'actions', label: '',              width: 120 },
]

const money = (n: number) => `£${n.toFixed(2)}`

export default function PricingManager({ accountId, accountName, groupId, groupName, onPricingChange }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [pricingProductId, setPricingProductId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AccountPricing | null>(null)
  const [search, setSearch] = useState('')
  const cols = useTable<Row>('account-pricing', COLUMNS)

  async function load() {
    const [p, pr, r, i] = await Promise.all([getProducts(), getPricingForAccount(accountId), getRecipes(), getIngredients()])
    setProducts(p); setPricing(pr); setRecipes(r); setIngredients(i)
    onPricingChange?.(pr)
    setLoading(false)
  }

  useEffect(() => {
    ;(async () => { await load() })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const costOf = (productId: string) => {
    const product = products.find((x) => x.id === productId)
    return product ? liveCost(product, recipes, ingredients) : { perLitre: null, fromRecipe: false, missing: [] as string[] }
  }
  const costNote = (productId: string) => {
    const c = costOf(productId)
    if (c.perLitre !== null) return undefined
    return c.fromRecipe ? `recipe has unpriced ingredients: ${c.missing.slice(0, 3).join(', ')}` : 'no recipe linked'
  }

  const target = { accountId, accountName, groupId, groupName }
  const pricedIds = new Set(pricing.map((p) => p.productId))
  const q = search.trim().toLowerCase()
  const unpriced = products
    .filter((p) => p.isActive !== false && !pricedIds.has(p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.productCode.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const rows: Row[] = pricing.map((p) => {
    const vol = p.volumeLitres ?? 5
    const ppl = p.pricePerLitre > 0 ? p.pricePerLitre : vol > 0 ? p.pricePerUnit / vol : 0
    const m = priceMetrics(ppl, p.recommendedServingG, p.rrp, costOf(p.productId).perLitre)
    return { p, ppl, perServe: m.perServe, costPerServe: m.costPerServe, venueGp: m.venueGp, ourGp: m.ourGp }
  })

  async function handleDelete(p: AccountPricing) {
    if (!confirm(`Remove the price for ${p.productName}?`)) return
    try { await deleteAccountPricing(p.id); toast.success('Removed'); await load() }
    catch { toast.error('Could not remove it') }
  }

  if (loading) return <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading…</p>

  const formProduct = editing ? products.find((x) => x.id === editing.productId) : products.find((x) => x.id === pricingProductId)

  return (
    <div>
      {formProduct && (
        <div style={{ marginBottom: '18px' }}>
          <PriceForm
            key={formProduct.id + (editing?.id ?? '')}
            product={formProduct}
            existing={editing ?? undefined}
            costPerLitre={costOf(formProduct.id).perLitre}
            costNote={costNote(formProduct.id)}
            target={target}
            onSaved={async () => { setEditing(null); setPricingProductId(null); await load() }}
            onCancel={() => { setEditing(null); setPricingProductId(null) }}
          />
        </div>
      )}

      {!formProduct && (
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <p style={{ fontSize: '12.5px', color: '#6b7280', margin: 0 }}>Price a product for {accountName}:</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12.5px', width: '220px' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
            {unpriced.slice(0, 60).map((p) => {
              const c = costOf(p.id)
              return (
                <button key={p.id} onClick={() => setPricingProductId(p.id)} title={c.perLitre !== null ? `Costs £${c.perLitre.toFixed(2)}/L` : 'No cost yet'}
                  style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {p.name}
                  {c.perLitre === null && <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309' }}>no cost</span>}
                </button>
              )
            })}
            {unpriced.length === 0 && <span style={{ fontSize: '12.5px', color: '#9ca3af' }}>{q ? 'Nothing matches.' : 'Every product is priced.'}</span>}
          </div>
        </div>
      )}

      {pricing.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No prices yet — pick a product above.</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}><cols.ResetButton /></div>
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
            <table className="dt" style={{ minWidth: cols.minWidth }}>
              <cols.ColGroup />
              <cols.Head />
              <tbody>
                {cols.sortRows(rows).map((r) => (
                  <tr key={r.p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'block', fontWeight: 600, color: '#111827', fontSize: '13px' }}>{r.p.productName}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{r.p.productCode}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12.5px', color: '#6b7280' }}>{r.p.volumeLitres ?? 5}L</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12.5px', color: '#6b7280' }}>{r.p.recommendedServingG || '—'}ml</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                      {money(r.ppl)}
                      {(() => {
                        const d = products.find((x) => x.id === r.p.productId)?.defaultPricePerLitre
                        if (!d) return null
                        const same = Math.abs(d - r.ppl) < 0.01
                        return <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 500, color: same ? '#9ca3af' : '#1d4ed8' }}>{same ? 'default' : `custom · default ${money(d)}`}</span>
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{r.perServe > 0 ? money(r.perServe) : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.p.rrp ? '#374151' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{r.p.rrp ? money(r.p.rrp) : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.costPerServe !== null ? '#374151' : '#b45309', fontVariantNumeric: 'tabular-nums' }}
                      title={costNote(r.p.productId)}>{r.costPerServe !== null ? money(r.costPerServe) : 'no cost'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}><GpBadge value={r.venueGp} kind="venue" /></td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}><GpBadge value={r.ourGp} kind="ours" /></td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => { setEditing(r.p); setPricingProductId(null) }}
                        style={{ fontSize: '12px', color: '#374151', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', padding: '3px 10px', fontWeight: 500, marginRight: '6px' }}>Edit</button>
                      <button onClick={() => handleDelete(r.p)} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: '#9ca3af' }}>
            Cost comes live from the product&apos;s recipe, the same number the catalog and the recipe show. Venue GP: green at 80%+. Our GP: green at 50%+.
          </p>
        </>
      )}
    </div>
  )
}
