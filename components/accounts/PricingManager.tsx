'use client'

import { useEffect, useState } from 'react'
import { getProducts, getPricingForAccount, upsertAccountPricing, deleteAccountPricing } from '@/lib/firestore/catalog'
import { Product, AccountPricing } from '@/types'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface Props {
  accountId: string
  accountName: string
  groupId?: string
  groupName?: string
  onPricingChange?: (pricing: AccountPricing[]) => void
}

function r2(n: number) { return Math.round(n * 100) / 100 }

// RRP is per serving. Scale up to per-bag revenue first, then compare against pricePerUnit.
function venueGp(rrp: number, pricePerUnit: number, volumeLitres: number, servingG: number) {
  if (!rrp || !pricePerUnit || !servingG) return 0
  const servingsPerBag  = (volumeLitres * 1000) / servingG
  const bagRevenueExVat = (rrp / 1.2) * servingsPerBag
  return r2(((bagRevenueExVat - pricePerUnit) / bagRevenueExVat) * 100)
}

function foodlabGp(pricePerUnit: number, costToMake: number, volumeLitres = 5, servingG = 100) {
  if (!pricePerUnit || !costToMake || !servingG) return 0
  const servingsPerBag = (volumeLitres * 1000) / servingG
  const costPerBag     = costToMake * servingsPerBag
  return r2(((pricePerUnit - costPerBag) / pricePerUnit) * 100)
}

function GpPill({ value }: { value: number }) {
  const c = value >= 75
    ? { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }
    : value >= 60
    ? { bg: '#fefce8', text: '#854d0e', border: '#fde68a' }
    : { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' }
  return (
    <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {value.toFixed(1)}%
    </span>
  )
}

export default function PricingManager({ accountId, accountName, groupId, groupName, onPricingChange }: Props) {
  const [products, setProducts]         = useState<Product[]>([])
  const [pricing, setPricing]           = useState<AccountPricing[]>([])
  const [loading, setLoading]           = useState(true)
  const [addingProduct, setAddingProduct] = useState<Product | null>(null)
  const [editingPricing, setEditingPricing] = useState<AccountPricing | null>(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({ pricePerLitre: '', servingG: '', rrp: '', volumeLitres: '5' })
  const [sortKey, setSortKey] = useState<string>('productName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function load() {
    const [p, pr] = await Promise.all([getProducts(), getPricingForAccount(accountId)])
    setProducts(p)
    setPricing(pr)
    onPricingChange?.(pr)
    setLoading(false)
  }

  useEffect(() => { load() }, [accountId])

  function openForm(product: Product) {
    setAddingProduct(product)
    setForm({
      pricePerLitre: '',
      servingG: product.recommendedServingG ? String(product.recommendedServingG) : '',
      rrp: '',
      volumeLitres: String(product.volumeLitres ?? 5),
    })
  }

  const productCostMap = new Map(products.map(p => [p.id, { costToMake: p.costToMake, servingG: p.recommendedServingG }]))
  const pricedIds      = new Set(pricing.map(p => p.productId))
  const unpricedProducts = products.filter(p => !pricedIds.has(p.id))

  function openEdit(p: AccountPricing) {
    const vol = p.volumeLitres ?? 5
    const ppl = vol > 0 ? r2(p.pricePerUnit / vol) : (p.pricePerLitre ?? 0)
    setEditingPricing(p)
    setAddingProduct(null)
    setForm({
      pricePerLitre: String(ppl),
      servingG:      String(p.recommendedServingG),
      rrp:           String(p.rrp),
      volumeLitres:  String(vol),
    })
  }

  // Live preview calculations
  const ppl  = parseFloat(form.pricePerLitre) || 0
  const sg   = parseFloat(form.servingG) || 0
  const rrp  = parseFloat(form.rrp) || 0
  const vol  = parseFloat(form.volumeLitres) || 5
  // pricePerUnit = price per bag = pricePerLitre × volumeLitres
  const pricePerUnit = ppl > 0 ? r2(ppl * vol) : 0

  const prevFoodlabGp = addingProduct && pricePerUnit > 0
    ? foodlabGp(pricePerUnit, addingProduct.costToMake, vol, sg)
    : 0
  const prevVenueGp = pricePerUnit > 0 && rrp > 0 ? venueGp(rrp, pricePerUnit, vol, sg) : 0
  const servingsPerL = sg > 0 ? r2(1000 / sg) : 0

  async function handleSave() {
    if (!addingProduct && !editingPricing) return
    if (ppl <= 0)  return toast.error('Enter a price per litre')
    if (sg <= 0)   return toast.error('Enter a serving size')
    if (rrp <= 0)  return toast.error('Enter a RRP')

    setSaving(true)
    try {
      const product = addingProduct ?? products.find(p => p.id === editingPricing!.productId)
      if (!product) return

      const entry: Omit<AccountPricing, 'id' | 'createdAt' | 'updatedAt'> = {
        accountId,
        accountName,
        productId:           product.id,
        productCode:         product.productCode,
        productName:         product.name,
        recommendedServingG: sg,
        volumeLitres:        vol,
        pricePerLitre:       ppl,
        pricePerUnit,
        rrp,
        venueGpPercent:    venueGp(rrp, pricePerUnit, vol, sg),
        foodlabGpPercent:  foodlabGp(pricePerUnit, product.costToMake, vol, sg),
      }
      if (groupId)   entry.groupId   = groupId
      if (groupName) entry.groupName = groupName

      await upsertAccountPricing(entry)
      toast.success(editingPricing ? 'Pricing updated' : 'Pricing saved')
      setAddingProduct(null)
      setEditingPricing(null)
      setForm({ pricePerLitre: '', servingG: '', rrp: '', volumeLitres: '5' })
      load()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove pricing for ${name}?`)) return
    try { await deleteAccountPricing(id); toast.success('Removed'); load() }
    catch { toast.error('Failed') }
  }

  if (loading) return <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>

  return (
    <div>
      {/* Add pricing form */}
      {(addingProduct || editingPricing) && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                {editingPricing ? editingPricing.productName : addingProduct!.name}
              </p>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>
                {editingPricing ? editingPricing.productCode : addingProduct!.productCode}
              </p>
            </div>
            <button onClick={() => { setAddingProduct(null); setEditingPricing(null) }} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {/* Price per litre */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                Price / litre (£) *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9ca3af' }}>£</span>
                <input
                  type="number" step="0.01" min="0"
                  placeholder="e.g. 30.00"
                  value={form.pricePerLitre}
                  onChange={e => setForm(f => ({ ...f, pricePerLitre: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px 8px 22px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Volume */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                Volume *
              </label>
              <div style={{ display: 'flex', gap: '5px' }}>
                {['5', '19'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, volumeLitres: v }))}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                      border: `1px solid ${form.volumeLitres === v ? '#111827' : '#d1d5db'}`,
                      background: form.volumeLitres === v ? '#111827' : '#fff',
                      color: form.volumeLitres === v ? '#fff' : '#374151',
                    }}
                  >
                    {v}L
                  </button>
                ))}
              </div>
            </div>

            {/* Serving size */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                Serving size (ml) *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" step="1" min="1"
                  placeholder="e.g. 100"
                  value={form.servingG}
                  onChange={e => setForm(f => ({ ...f, servingG: e.target.value }))}
                  style={{ width: '100%', padding: '8px 30px 8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#9ca3af' }}>ml</span>
              </div>
            </div>

            {/* RRP */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                RRP (£) *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9ca3af' }}>£</span>
                <input
                  type="number" step="0.01" min="0"
                  placeholder="e.g. 12.00"
                  value={form.rrp}
                  onChange={e => setForm(f => ({ ...f, rrp: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px 8px 22px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          {ppl > 0 && sg > 0 && rrp > 0 && (
            <div style={{ display: 'flex', gap: '20px', padding: '12px 16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price / {vol}L bag</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>£{pricePerUnit.toFixed(2)}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Servings / bag</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>{sg > 0 ? r2((vol * 1000) / sg) : '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Venue GP (ex-VAT)</p>
                <GpPill value={prevVenueGp} />
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Foodlab GP</p>
                <GpPill value={prevFoodlabGp} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" onClick={handleSave} loading={saving}>{editingPricing ? 'Update pricing' : 'Save pricing'}</Button>
            <Button size="sm" variant="secondary" onClick={() => { setAddingProduct(null); setEditingPricing(null) }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Product picker */}
      {!addingProduct && unpricedProducts.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Add a product:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {unpricedProducts.map(p => (
              <button
                key={p.id}
                onClick={() => openForm(p)}
                style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {p.name}
                <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px' }}>
                  {p.volumeLitres ?? 5}L
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pricing table */}
      {pricing.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
          No pricing set up yet — add products above.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {[
                  { label: 'Product',    key: 'productName',       right: false },
                  { label: 'Code',       key: 'productCode',       right: false },
                  { label: 'Vol',        key: 'volumeLitres',      right: true  },
                  { label: 'Serve (ml)', key: 'recommendedServingG', right: true },
                  { label: 'Price/L',    key: 'pricePerLitre',     right: true  },
                  { label: 'Price/bag',  key: 'pricePerUnit',      right: true  },
                  { label: 'RRP',        key: 'rrp',               right: true  },
                  { label: 'Venue GP',   key: 'venueGpPercent',    right: true  },
                  { label: 'Foodlab GP', key: 'foodlabGpPercent',  right: true  },
                  { label: '',           key: '',                   right: true  },
                ].map(({ label, key, right }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    style={{
                      textAlign: right ? 'right' : 'left',
                      padding: '10px 14px', fontWeight: 500, fontSize: '10px',
                      cursor: key ? 'pointer' : 'default',
                      userSelect: 'none',
                      color: sortKey === key ? '#374151' : '#9ca3af',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                    {key && sortKey === key && (
                      <span style={{ marginLeft: '3px', fontSize: '9px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...pricing].sort((a, b) => {
                let av: any, bv: any
                if (sortKey === 'pricePerLitre') {
                  const va = a.volumeLitres ?? 5; const vb = b.volumeLitres ?? 5
                  av = va > 0 ? a.pricePerUnit / va : 0
                  bv = vb > 0 ? b.pricePerUnit / vb : 0
                } else {
                  av = (a as any)[sortKey] ?? 0
                  bv = (b as any)[sortKey] ?? 0
                }
                if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
                return sortDir === 'asc' ? av - bv : bv - av
              }).map(p => {
                const vol2   = p.volumeLitres ?? 5
                const ppl    = vol2 > 0 ? r2(p.pricePerUnit / vol2) : (p.pricePerLitre ?? 0)
                const gp     = venueGp(p.rrp, p.pricePerUnit, vol2, p.recommendedServingG)
                const prod   = productCostMap.get(p.productId)
                const fGp    = prod?.costToMake
                  ? foodlabGp(p.pricePerUnit, prod.costToMake, vol2, prod.servingG || p.recommendedServingG)
                  : p.foodlabGpPercent
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 500, color: '#111827' }}>{p.productName}</td>
                    <td style={{ padding: '11px 14px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '11px' }}>{p.productCode}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>
                        {vol2}L
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6b7280' }}>{p.recommendedServingG || '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>£{ppl.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6b7280' }}>£{p.pricePerUnit.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6b7280' }}>£{p.rrp.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}><GpPill value={gp} /></td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}><GpPill value={fGp} /></td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openEdit(p)}
                        style={{ fontSize: '12px', color: '#374151', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', padding: '3px 10px', fontWeight: 500 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.productName)}
                        style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}