'use client'

import { useState } from 'react'
import { updateProduct } from '@/lib/firestore/catalog'
import { Product } from '@/types'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

const CATEGORIES = [
  'Highball', 'Martini', 'Sour', 'Negroni', 'Margarita', 'Spritz',
  'G&T', 'Old Fashioned', 'Milk Punch', 'Tropical', 'Savoury',
  'Coffee', 'Non-Alcoholic', 'Other',
]

interface Props {
  product: Product
  onClose: () => void
  onSaved: () => void
}

export default function EditProductModal({ product, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name:                product.name,
    category:            product.category ?? 'Other',
    recommendedServingG: product.recommendedServingG,
    costToMake:          product.costToMake,
    costMissing:         product.costMissing ?? false,
    isNonAlcoholic:      product.isNonAlcoholic,
    isCoreRange:         product.isCoreRange ?? false,
    defaultPricePerLitre:product.defaultPricePerLitre ?? 0,
    servingNotes:        product.servingNotes ?? '',
    isActive:            product.isActive,
  })
  const [saving, setSaving] = useState(false)

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  const costPerLitre = form.recommendedServingG > 0 && form.costToMake > 0
    ? ((form.costToMake / form.recommendedServingG) * 1000).toFixed(2)
    : null

  const servingsPerLitre = form.recommendedServingG > 0
    ? (1000 / form.recommendedServingG).toFixed(1)
    : null

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Name is required')
    if (form.recommendedServingG <= 0) return toast.error('Serving size must be greater than 0')
    setSaving(true)
    try {
      const updates: Partial<Product> = {
        name:                form.name.trim(),
        category:            form.category,
        recommendedServingG: Number(form.recommendedServingG),
        costToMake:          Number(form.costToMake),
        costMissing:         form.costMissing || form.costToMake === 0,
        isNonAlcoholic:      form.isNonAlcoholic,
        isCoreRange:         form.isCoreRange,
        isActive:            form.isActive,
      }
      if (form.servingNotes.trim()) updates.servingNotes = form.servingNotes.trim()
      if (form.isCoreRange && form.defaultPricePerLitre > 0) {
        updates.defaultPricePerLitre = Number(form.defaultPricePerLitre)
      }
      await updateProduct(product.id, updates)
      toast.success('Product updated')
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '60px', paddingBottom: '40px', zIndex: 50,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px',
        maxHeight: '82vh', overflow: 'auto', margin: '0 20px',
        border: '1px solid #e5e7eb',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Edit product</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0', fontFamily: 'monospace' }}>{product.productCode}</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

            {/* Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Name *</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Category</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Serving size */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Serving size (ml)</label>
              <input
                type="number" min={1}
                value={form.recommendedServingG}
                onChange={e => set('recommendedServingG', Number(e.target.value))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Cost to make */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>
                Cost to make (£)
                {form.costMissing && (
                  <span style={{ marginLeft: '6px', fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }}>missing</span>
                )}
              </label>
              <input
                type="number" min={0} step={0.01}
                value={form.costToMake}
                onChange={e => set('costToMake', Number(e.target.value))}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${form.costMissing ? '#fcd34d' : '#e5e7eb'}`, borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Serving notes */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Serving notes (optional)</label>
              <input
                value={form.servingNotes}
                onChange={e => set('servingNotes', e.target.value)}
                placeholder="e.g. Foam on top, Saffron cream on top"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Core range default price */}
            {form.isCoreRange && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Default price per litre (£)</label>
                <input
                  type="number" min={0} step={0.01}
                  value={form.defaultPricePerLitre}
                  onChange={e => set('defaultPricePerLitre', Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Flags row */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {[
                { id: 'na', label: 'Non-alcoholic', field: 'isNonAlcoholic', value: form.isNonAlcoholic },
                { id: 'cr', label: 'Core range (available to all clients)', field: 'isCoreRange', value: form.isCoreRange },
                { id: 'ac', label: 'Active', field: 'isActive', value: form.isActive },
              ].map(({ id, label, field, value }) => (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={e => set(field, e.target.checked)}
                    style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Live preview */}
          {(costPerLitre || servingsPerLitre) && (
            <div style={{ marginTop: '16px', padding: '12px 14px', background: '#f9fafb', borderRadius: '8px', display: 'flex', gap: '24px', fontSize: '12px', color: '#6b7280' }}>
              {servingsPerLitre && (
                <span>Servings / litre: <strong style={{ color: '#111' }}>{servingsPerLitre}</strong></span>
              )}
              {costPerLitre && (
                <span>Cost / litre: <strong style={{ color: '#111' }}>£{costPerLitre}</strong></span>
              )}
              {form.isCoreRange && form.defaultPricePerLitre > 0 && form.costToMake > 0 && (
                <span>Foodlab GP (core): <strong style={{ color: '#166534' }}>
                  {(((form.defaultPricePerLitre - (form.costToMake / form.recommendedServingG * 1000)) / form.defaultPricePerLitre) * 100).toFixed(1)}%
                </strong></span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}