'use client'

import { useState } from 'react'
import { createProduct } from '@/lib/firestore/catalog'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

const CATEGORIES = [
  'Highball', 'Martini', 'Sour', 'Negroni', 'Margarita', 'Spritz',
  'G&T', 'Old Fashioned', 'Milk Punch', 'Tropical', 'Savoury',
  'Coffee', 'Non-Alcoholic', 'Other',
]

interface ParsedProduct {
  name: string
  category: string
  recommendedServingG: number
  costToMake: number
  isNonAlcoholic: boolean
  servingNotes: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

async function getNextProductCode(): Promise<string> {
  const q = query(collection(db, 'products'), orderBy('productCode', 'desc'), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return 'FL-100001'
  const last = snap.docs[0].data().productCode as string
  const num = parseInt(last.replace('FL-', ''), 10)
  return `FL-${num + 1}`
}

export default function AddProductModal({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [rawInput, setRawInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedProduct[]>([])
  const [saving, setSaving] = useState(false)

  // single manual form
  const emptyForm: ParsedProduct = {
    name: '', category: 'Highball', recommendedServingG: 100,
    costToMake: 0, isNonAlcoholic: false, servingNotes: '',
  }
  const [manualMode, setManualMode] = useState(false)

  async function handleParse() {
    if (!rawInput.trim()) return toast.error('Paste some content first')
    setParsing(true)
    try {
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'product', input: rawInput }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const products: ParsedProduct[] = json.data.products ?? []
      if (products.length === 0) throw new Error('No products found in input')
      setParsed(products)
      setStep('review')
    } catch (e: any) {
      toast.error(e.message ?? 'Parse failed')
    } finally {
      setParsing(false)
    }
  }

  function updateField(index: number, field: keyof ParsedProduct, value: any) {
    setParsed(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  function removeProduct(index: number) {
    setParsed(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (parsed.length === 0) return toast.error('Nothing to save')
    setSaving(true)
    try {
      let nextCode = await getNextProductCode()
      const num = (code: string) => parseInt(code.replace('FL-', ''), 10)

      for (const p of parsed) {
        await createProduct({
          productCode: nextCode,
          name: p.name.trim(),
          category: p.category,
          recommendedServingG: Number(p.recommendedServingG),
          costToMake: Number(p.costToMake),
          isNonAlcoholic: p.isNonAlcoholic,
          servingNotes: p.servingNotes || undefined,
          isActive: true,
        })
        nextCode = `FL-${num(nextCode) + 1}`
      }
      toast.success(`${parsed.length} product${parsed.length > 1 ? 's' : ''} added`)
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed')
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
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px',
        maxHeight: '80vh', overflow: 'auto', margin: '0 20px',
        border: '1px solid #e5e7eb',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              {step === 'input' ? 'Add products' : `Review ${parsed.length} product${parsed.length !== 1 ? 's' : ''}`}
            </h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0' }}>
              {step === 'input'
                ? 'Paste a CSV, spreadsheet data, or describe your cocktails — AI will parse it'
                : 'Check and edit before saving to catalog'}
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {/* Step 1: Input */}
        {step === 'input' && (
          <div style={{ padding: '20px 24px' }}>
            <textarea
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              placeholder={`Paste anything — examples:\n\nApple Bun, 130ml, £4.00\nHay, 80ml, £4.00\n\nOr: "Add a spicy margarita, 100ml serve, costs £2.50 to make"\n\nOr paste a full CSV from a spreadsheet`}
              rows={10}
              style={{
                width: '100%', padding: '12px', border: '1px solid #e5e7eb',
                borderRadius: '10px', fontSize: '13px', fontFamily: 'monospace',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
              <Button onClick={handleParse} loading={parsing} disabled={!rawInput.trim()}>
                Parse with AI
              </Button>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>or</span>
              <Button
                variant="secondary"
                onClick={() => { setParsed([{ ...emptyForm }]); setManualMode(true); setStep('review') }}
              >
                Add manually
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {parsed.map((p, i) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', position: 'relative' }}>
                  <button
                    onClick={() => removeProduct(i)}
                    style={{ position: 'absolute', top: '12px', right: '12px', color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}
                  >
                    ×
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Name *</label>
                      <input
                        value={p.name}
                        onChange={e => updateField(i, 'name', e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Category</label>
                      <select
                        value={p.category}
                        onChange={e => updateField(i, 'category', e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Serve size (ml)</label>
                      <input
                        type="number" min={1}
                        value={p.recommendedServingG}
                        onChange={e => updateField(i, 'recommendedServingG', e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Cost to make (£)</label>
                      <input
                        type="number" min={0} step={0.01}
                        value={p.costToMake}
                        onChange={e => updateField(i, 'costToMake', e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Serving notes (optional)</label>
                      <input
                        value={p.servingNotes}
                        onChange={e => updateField(i, 'servingNotes', e.target.value)}
                        placeholder="e.g. Foam on top"
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px' }}>
                      <input
                        type="checkbox"
                        id={`na-${i}`}
                        checked={p.isNonAlcoholic}
                        onChange={e => updateField(i, 'isNonAlcoholic', e.target.checked)}
                        style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                      />
                      <label htmlFor={`na-${i}`} style={{ fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                        Non-alcoholic
                      </label>
                    </div>
                  </div>

                  {/* Live preview */}
                  {p.costToMake > 0 && p.recommendedServingG > 0 && (
                    <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', display: 'flex', gap: '20px', fontSize: '12px', color: '#6b7280' }}>
                      <span>Cost / litre: <strong style={{ color: '#111' }}>£{((Number(p.costToMake) / Number(p.recommendedServingG)) * 1000).toFixed(2)}</strong></span>
                      <span>Servings / litre: <strong style={{ color: '#111' }}>{(1000 / Number(p.recommendedServingG)).toFixed(1)}</strong></span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setParsed(prev => [...prev, { ...emptyForm }])}
              style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280', background: 'none', border: '1px dashed #d1d5db', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', width: '100%' }}
            >
              + Add another product
            </button>

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'space-between' }}>
              <Button variant="secondary" onClick={() => setStep('input')}>← Back</Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} loading={saving} disabled={parsed.length === 0}>
                  Save {parsed.length} product{parsed.length !== 1 ? 's' : ''} to catalog
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}