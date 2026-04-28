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
  const [lineItems, setLineItems] = useState<OrderLineItem[]>(
    order.lineItems.map(l => ({ ...l }))
  )
  const [availablePricing, setAvailablePricing] = useState<AccountPricing[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPricingForAccount(order.accountId).then(setAvailablePricing)
  }, [order.accountId])

  function updateQty(productId: string, qty: number) {
    const q = Math.max(0.5, qty)
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
    const ppl = p.pricePerLitre > 0
      ? p.pricePerLitre
      : p.recommendedServingG > 0
        ? r2((p.pricePerUnit / p.recommendedServingG) * 1000)
        : p.pricePerUnit
    setLineItems(prev => [...prev, {
      productId:    p.productId,
      productCode:  p.productCode,
      productName:  p.productName,
      quantity:     1,
      unitPrice:    ppl,
      lineTotal:    ppl,
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
    if (lineItems.length === 0) return toast.error('Add at least one product')
    setSaving(true)
    try {
      // 1. Update order
      await updateOrder(order.id, { lineItems, subtotal, vatAmount, total })

      // 2. Also update the linked payment amount so invoice stays accurate
      const q = query(collection(db, 'payments'), where('orderId', '==', order.id))
      const snap = await getDocs(q)
      for (const d of snap.docs) {
        await updateDoc(doc(db, 'payments', d.id), {
          amount: total,
          updatedAt: Timestamp.now(),
        })
      }

      toast.success('Order updated')
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
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
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Edit order</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0', fontFamily: 'monospace' }}>{order.orderNumber}</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Line items table */}
          <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {['Product', 'Price / L', 'Litres', 'Total', ''].map((h, i) => (
                    <th key={h+i} style={{ padding: '8px 16px', fontWeight: 500, textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</th>
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
                    <td style={cell({ textAlign: 'right', color: '#6b7280' })}>£{item.unitPrice.toFixed(2)}</td>
                    <td style={cell({ textAlign: 'right' })}>
                      <input
                        type="number" min={0.5} step={0.5}
                        value={item.quantity}
                        onChange={e => updateQty(item.productId, parseFloat(e.target.value) || 0.5)}
                        style={{ width: '72px', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', textAlign: 'right', outline: 'none' }}
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
                {unaddedProducts.map(p => {
                  const ppl = p.pricePerLitre > 0 ? p.pricePerLitre : r2((p.pricePerUnit / p.recommendedServingG) * 1000)
                  return (
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
                      <span style={{ color: '#9ca3af', fontSize: '11px' }}>£{ppl.toFixed(2)}/L</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}