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

// GP uses ex-VAT RRP — real margin after handing 20% VAT to HMRC
function venueGp(rrp: number, pricePerUnit: number) {
  if (!rrp) return 0
  const rrpExVat = rrp / 1.2
  return r2(((rrpExVat - pricePerUnit) / rrpExVat) * 100)
}

function foodlabGp(pricePerUnit: number, cost: number) {
  if (!pricePerUnit || !cost) return 0
  return r2(((pricePerUnit - cost) / pricePerUnit) * 100)
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
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({ pricePerLitre: '', servingG: '', rrp: '' })

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
    // Pre-fill serving size from the product if available
    setForm({
      pricePerLitre: '',
      servingG: product.recommendedServingG ? String(product.recommendedServingG) : '',
      rrp: '',
    })
  }

  const pricedIds = new Set(pricing.map(p => p.productId))
  const unpricedProducts = products.filter(p => !pricedIds.has(p.id))

  // Live preview calculations
  const ppl  = parseFloat(form.pricePerLitre) || 0
  const sg   = parseFloat(form.servingG) || 0
  const rrp  = parseFloat(form.rrp) || 0
  const pricePerUnit = sg > 0 ? r2(ppl * (sg / 1000)) : 0

  const prevFoodlabGp = addingProduct && pricePerUnit > 0
    ? foodlabGp(pricePerUnit, addingProduct.costToMake)
    : 0
  const prevVenueGp = pricePerUnit > 0 && rrp > 0 ? venueGp(rrp, pricePerUnit) : 0
  const servingsPerL = sg > 0 ? r2(1000 / sg) : 0

  async function handleSave() {
    if (!addingProduct) return
    if (ppl <= 0)  return toast.error('Enter a price per litre')
    if (sg <= 0)   return toast.error('Enter a serving size')
    if (rrp <= 0)  return toast.error('Enter a RRP')

    setSaving(true)
    try {
      const entry: Omit<AccountPricing, 'id' | 'createdAt' | 'updatedAt'> = {
        accountId,
        accountName,
        productId:           addingProduct.id,
        productCode:         addingProduct.productCode,
        productName:         addingProduct.name,
        recommendedServingG: sg,
        pricePerLitre:       ppl,
        pricePerUnit,
        rrp,
        venueGpPercent:    venueGp(rrp, pricePerUnit),
        foodlabGpPercent:  foodlabGp(pricePerUnit, addingProduct.costToMake),
      }
      if (groupId)   entry.groupId   = groupId
      if (groupName) entry.groupName = groupName

      await upsertAccountPricing(entry)
      toast.success('Pricing saved')
      setAddingProduct(null)
      setForm({ pricePerLitre: '', servingG: '', rrp: '' })
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
      {addingProduct && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{addingProduct.name}</p>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{addingProduct.productCode}</p>
            </div>
            <button onClick={() => setAddingProduct(null)} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
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
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price / unit</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>£{pricePerUnit.toFixed(2)}</p>
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Servings / litre</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>{servingsPerL}</p>
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
            <Button size="sm" onClick={handleSave} loading={saving}>Save pricing</Button>
            <Button size="sm" variant="secondary" onClick={() => setAddingProduct(null)}>Cancel</Button>
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
                style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151' }}
              >
                {p.name}
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
                {['Product', 'Code', 'Serve (ml)', 'Price/L', 'Price/unit', 'RRP', 'Venue GP', 'Foodlab GP', ''].map((h, i) => (
                  <th key={h+i} style={{ textAlign: i >= 2 && i <= 7 ? 'right' : 'left', padding: '10px 14px', fontWeight: 500, fontSize: '10px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricing.map(p => {
                const ppl = p.pricePerLitre || (p.recommendedServingG > 0 ? r2((p.pricePerUnit / p.recommendedServingG) * 1000) : 0)
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 500, color: '#111827' }}>{p.productName}</td>
                    <td style={{ padding: '11px 14px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '11px' }}>{p.productCode}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6b7280' }}>{p.recommendedServingG || '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>£{ppl.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6b7280' }}>£{p.pricePerUnit.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#6b7280' }}>£{p.rrp.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}><GpPill value={p.venueGpPercent} /></td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}><GpPill value={p.foodlabGpPercent} /></td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
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