'use client'

import { useState, useEffect } from 'react'
import { getPricingForAccount } from '@/lib/firestore/catalog'
import { updateOrder } from '@/lib/firestore/orders'
import { updateDoc, collection, query, where, getDocs, doc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Order, OrderLineItem, AccountPricing } from '@/types'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface Props {
  order: Order
  onClose: () => void
  onSaved: () => void
}

const VAT_RATE = 0.20

function r2(n: number) { return Math.round(n * 100) / 100 }

export default function EditOrderModal({ order, onClose, onSaved }: Props) {
  const isRd = order.type === 'rd'

  const [lineItems, setLineItems] = useState<OrderLineItem[]>(
    order.lineItems.map(l => ({ ...l }))
  )
  const [availablePricing, setAvailablePricing] = useState<AccountPricing[]>([])
  const [saving, setSaving] = useState(false)

  // R&D fields
  const [rdBrief,    setRdBrief]    = useState(order.rdBrief    ?? '')
  const [rdAssignee, setRdAssignee] = useState(order.rdAssignee ?? '')
  const [rdEndDate,  setRdEndDate]  = useState(
    order.rdEndDate ? (order.rdEndDate instanceof Date ? order.rdEndDate : (order.rdEndDate as any).toDate()).toISOString().split('T')[0] : ''
  )
  const [rdPrice,    setRdPrice]    = useState(order.rdPrice ? String(order.rdPrice) : '')
  const [vatIncl,    setVatIncl]    = useState(false)

  const priceNum  = parseFloat(rdPrice) || 0
  const subtotalRd = vatIncl ? r2(priceNum / 1.2) : priceNum
  const vatAmtRd   = r2(subtotalRd * VAT_RATE)
  const totalRd    = r2(subtotalRd + vatAmtRd)

  useEffect(() => {
    if (!isRd) getPricingForAccount(order.accountId).then(setAvailablePricing)
  }, [order.accountId, isRd])

  function updateQty(productId: string, qty: number) {
    const q = Math.max(1, Math.round(qty))
    setLineItems(prev =>
      prev.map(l => l.productId === productId
        ? { ...l, quantity: q, lineTotal: r2(q * l.unitPrice) }
        : l
      )
    )
  }

  function removeLine(productId: string) {
    setLineItems(prev => prev.filter(l => l.productId !== productId))
  }

  function addProduct(p: AccountPricing) {
    if (lineItems.some(l => l.productId === p.productId)) return
    setLineItems(prev => [...prev, {
      productId:    p.productId,
      productCode:  p.productCode,
      productName:  p.productName,
      volumeLitres: p.volumeLitres,
      quantity:     1,
      unitPrice:    p.pricePerUnit,
      lineTotal:    p.pricePerUnit,
      servingSizeG: p.recommendedServingG,
    }])
  }

  const subtotal  = r2(lineItems.reduce((s, l) => s + l.lineTotal, 0))
  const vatAmount = r2(subtotal * VAT_RATE)
  const total     = r2(subtotal + vatAmount)

  const unaddedProducts = availablePricing.filter(
    p => !lineItems.some(l => l.productId === p.productId)
  )

  async function handleSave() {
    setSaving(true)
    try {
      if (isRd) {
        const updates: any = { rdBrief: rdBrief.trim(), rdAssignee: rdAssignee.trim() }
        if (rdEndDate) updates.rdEndDate = new Date(rdEndDate)
        if (priceNum > 0) {
          updates.rdPrice = priceNum; updates.subtotal = subtotalRd
          updates.vatRate = VAT_RATE; updates.vatAmount = vatAmtRd; updates.total = totalRd
        }
        await updateOrder(order.id, updates)
      } else {
        if (lineItems.length === 0) { setSaving(false); return toast.error('Add at least one product') }
        const subtotal  = r2(lineItems.reduce((s, l) => s + l.lineTotal, 0))
        const vatAmount = r2(subtotal * VAT_RATE)
        const total     = r2(subtotal + vatAmount)
        await updateOrder(order.id, { lineItems, subtotal, vatAmount, total })
        const q = query(collection(db, 'payments'), where('orderId', '==', order.id))
        const snap = await getDocs(q)
        for (const d of snap.docs) {
          await updateDoc(doc(db, 'payments', d.id), { amount: total, updatedAt: Timestamp.now() })
        }
      }
      toast.success('Order updated')
      onSaved(); onClose()
    } catch (e) {
      console.error(e); toast.error('Failed to save')
    } finally { setSaving(false) }
  }

  const cell = (style?: React.CSSProperties) => ({
    padding: '10px 16px',
    fontSize: '13px',
    ...style,
  })

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '48px', paddingBottom: '40px', zIndex: 100,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '700px',
        maxHeight: '86vh', overflow: 'auto', margin: '0 20px', border: '1px solid #e5e7eb',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{isRd ? 'Edit R&D project' : 'Edit order'}</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0', fontFamily: 'monospace' }}>{order.orderNumber}</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* R&D fields */}
          {isRd && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={lbl}>Assigned to</label>
                <input value={rdAssignee} onChange={e => setRdAssignee(e.target.value)} placeholder="Team member name"
                  style={inpStyle} />
              </div>
              <div>
                <label style={lbl}>Brief / description</label>
                <textarea value={rdBrief} onChange={e => setRdBrief(e.target.value)} rows={4}
                  placeholder="What is the client looking for?"
                  style={{ ...inpStyle, resize: 'none' as const }} />
              </div>
              <div>
                <label style={lbl}>Expected end date</label>
                <input type="date" value={rdEndDate} onChange={e => setRdEndDate(e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lbl}>R&D fee (£) <span style={{ fontWeight: 400, color: '#9ca3af' }}>— leave blank to keep current</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>£</span>
                    <input type="number" min="0" step="0.01" value={rdPrice} onChange={e => setRdPrice(e.target.value)}
                      placeholder="0.00" style={{ ...inpStyle, paddingLeft: '24px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[false, true].map(v => (
                      <button key={String(v)} onClick={() => setVatIncl(v)} style={{
                        flex: 1, padding: '9px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                        border: `1px solid ${vatIncl === v ? '#111827' : '#e5e7eb'}`,
                        background: vatIncl === v ? '#111827' : '#fff', color: vatIncl === v ? '#fff' : '#374151',
                      }}>{v ? 'Inc. VAT' : 'Ex-VAT'}</button>
                    ))}
                  </div>
                </div>
                {priceNum > 0 && (
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '8px 0 0' }}>
                    Ex-VAT £{subtotalRd.toFixed(2)} + VAT £{vatAmtRd.toFixed(2)} = <strong>£{totalRd.toFixed(2)} total</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Line items table — hidden for R&D */}
          {!isRd && (<>
          <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {['Product', 'Vol', 'Price / bag', 'Qty', 'Total', ''].map((h, i) => (
                    <th key={h+i} style={{ padding: '8px 16px', fontWeight: 500, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.productId} style={{ borderTop: '1px solid #f3f4f6', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                    <td style={cell()}>
                      <p style={{ fontWeight: 500, color: '#111827', margin: 0 }}>{item.productName}</p>
                      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{item.productCode}</p>
                    </td>
                    <td style={cell()}>
                      <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>
                        {item.volumeLitres}L
                      </span>
                    </td>
                    <td style={cell({ textAlign: 'right', color: '#6b7280' })}>£{item.unitPrice.toFixed(2)}</td>
                    <td style={cell({ textAlign: 'right' })}>
                      <input
                        type="number" min={1} step={1}
                        value={item.quantity}
                        onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                        style={{ width: '60px', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', textAlign: 'right', outline: 'none' }}
                      />
                    </td>
                    <td style={cell({ textAlign: 'right', fontWeight: 600, color: '#111827' })}>£{item.lineTotal.toFixed(2)}</td>
                    <td style={cell({ textAlign: 'right' })}>
                      <button
                        onClick={() => removeLine(item.productId)}
                        style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                      >×</button>
                    </td>
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                      No products — add from the list below
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ padding: '10px 16px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', fontSize: '13px' }}>
              {[['Subtotal', `£${subtotal.toFixed(2)}`], ['VAT (20%)', `£${vatAmount.toFixed(2)}`]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'flex-end', gap: '48px', color: '#6b7280', marginBottom: '3px' }}>
                  <span>{l}</span><span style={{ width: '80px', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '48px', fontWeight: 700, color: '#111827', paddingTop: '6px', borderTop: '1px solid #e5e7eb', marginTop: '3px', fontSize: '14px' }}>
                <span>Total</span><span style={{ width: '80px', textAlign: 'right' }}>£{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Add products */}
          {unaddedProducts.length > 0 && (
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 8px', fontWeight: 500 }}>Add product:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {unaddedProducts.map(p => (
                  <button
                    key={p.productId}
                    onClick={() => addProduct(p)}
                    style={{
                      padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                      border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    {p.productName}
                    <span style={{ background: '#e5e7eb', color: '#374151', fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px' }}>{p.volumeLitres}L</span>
                    <span style={{ color: '#9ca3af', fontSize: '11px' }}>£{p.pricePerUnit.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          </> )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '6px' }
const inpStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, background: '#fff' }