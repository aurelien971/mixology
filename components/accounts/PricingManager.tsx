'use client'

import { useEffect, useState } from 'react'
import { getProducts, getPricingForAccount, upsertAccountPricing, deleteAccountPricing } from '@/lib/firestore/catalog'
import { Product, AccountPricing } from '@/types'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface Props {
  accountId: string
  accountName: string
  onPricingChange?: (pricing: AccountPricing[]) => void
}

function calcFoodlabGp(sell: number, cost: number) {
  if (!sell) return 0
  return Math.round(((sell - cost) / sell) * 10000) / 100
}

function calcVenueGp(rrp: number, sell: number) {
  if (!rrp) return 0
  return Math.round(((rrp - sell) / rrp) * 10000) / 100
}

function GpPill({ value }: { value: number }) {
  const color = value >= 75
    ? { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }
    : value >= 60
    ? { bg: '#fefce8', text: '#854d0e', border: '#fde68a' }
    : { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
      background: color.bg, color: color.text, border: `1px solid ${color.border}`,
    }}>
      {value.toFixed(1)}%
    </span>
  )
}

export default function PricingManager({ accountId, accountName, onPricingChange }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [loading, setLoading] = useState(true)
  const [addingProduct, setAddingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState({ pricePerUnit: '', rrp: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const [p, pr] = await Promise.all([getProducts(), getPricingForAccount(accountId)])
    setProducts(p)
    setPricing(pr)
    onPricingChange?.(pr)
    setLoading(false)
  }

  useEffect(() => { load() }, [accountId])

  const pricedProductIds = new Set(pricing.map(p => p.productId))
  const unpricedProducts = products.filter(p => !pricedProductIds.has(p.id))

  async function handleSave() {
    if (!addingProduct) return
    const sell = parseFloat(form.pricePerUnit)
    const rrp = parseFloat(form.rrp)
    if (!sell || sell <= 0) return toast.error('Enter a valid sell price')
    if (!rrp || rrp <= 0) return toast.error('Enter a valid RRP')
    if (sell > rrp) return toast.error('Sell price cannot exceed RRP')
    setSaving(true)
    try {
      await upsertAccountPricing({
        accountId,
        accountName,
        productId: addingProduct.id,
        productCode: addingProduct.productCode,
        productName: addingProduct.name,
        pricePerUnit: sell,
        rrp,
        foodlabGpPercent: calcFoodlabGp(sell, addingProduct.costToMake),
        venueGpPercent: calcVenueGp(rrp, sell),
      })
      toast.success('Pricing saved')
      setAddingProduct(null)
      setForm({ pricePerUnit: '', rrp: '' })
      load()
    } catch {
      toast.error('Failed to save pricing')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove pricing for ${name}?`)) return
    try {
      await deleteAccountPricing(id)
      toast.success('Removed')
      load()
    } catch {
      toast.error('Failed to remove')
    }
  }

  const previewSell = parseFloat(form.pricePerUnit) || 0
  const previewRrp = parseFloat(form.rrp) || 0
  const previewFoodlabGp = addingProduct ? calcFoodlabGp(previewSell, addingProduct.costToMake) : 0
  const previewVenueGp = calcVenueGp(previewRrp, previewSell)

  if (loading) return <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>

  return (
    <div>
      {addingProduct && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>{addingProduct.name}</p>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>
                {addingProduct.productCode} · Cost to make: £{addingProduct.costToMake.toFixed(2)}
              </p>
            </div>
            <button onClick={() => setAddingProduct(null)} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>
                Sell price to venue (£) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 3.00"
                value={form.pricePerUnit}
                onChange={e => setForm(f => ({ ...f, pricePerUnit: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>
                Venue RRP (£) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 12.00"
                value={form.rrp}
                onChange={e => setForm(f => ({ ...f, rrp: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {previewSell > 0 && previewRrp > 0 && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Foodlab GP</p>
                <GpPill value={previewFoodlabGp} />
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Venue GP</p>
                <GpPill value={previewVenueGp} />
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Foodlab margin</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>
                  £{(previewSell - addingProduct.costToMake).toFixed(2)} / unit
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" onClick={handleSave} loading={saving}>Save pricing</Button>
            <Button size="sm" variant="secondary" onClick={() => { setAddingProduct(null); setForm({ pricePerUnit: '', rrp: '' }) }}>Cancel</Button>
          </div>
        </div>
      )}

      {!addingProduct && unpricedProducts.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Add product to this account:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {unpricedProducts.map(p => (
              <button
                key={p.id}
                onClick={() => { setAddingProduct(p); setForm({ pricePerUnit: '', rrp: '' }) }}
                style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                  border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {pricing.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
          No pricing set up yet. Add products above.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 500 }}>Product</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 500 }}>Code</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 500 }}>Cost to make</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 500 }}>Sell price</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 500 }}>RRP</th>
                <th style={{ textAlign: 'center', padding: '10px 16px', fontWeight: 500 }}>Foodlab GP</th>
                <th style={{ textAlign: 'center', padding: '10px 16px', fontWeight: 500 }}>Venue GP</th>
                <th style={{ padding: '10px 16px' }} />
              </tr>
            </thead>
            <tbody>
              {pricing.map(p => {
                const product = products.find(pr => pr.id === p.productId)
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#111827' }}>{p.productName}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.productCode}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>
                      {product ? `£${product.costToMake.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#111827', textAlign: 'right' }}>£{p.pricePerUnit.toFixed(2)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>£{p.rrp.toFixed(2)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><GpPill value={p.foodlabGpPercent} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><GpPill value={p.venueGpPercent} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
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