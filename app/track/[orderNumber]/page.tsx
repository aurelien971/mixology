'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Order } from '@/types'

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    received:   { label: 'Received',      bg: '#EFF6FF', color: '#1D4ED8' },
    production: { label: 'In production', bg: '#F5F3FF', color: '#6D28D9' },
    dispatched: { label: 'Dispatched',    bg: '#FFFBEB', color: '#B45309' },
    delivered:  { label: 'Delivered',     bg: '#F0FDF4', color: '#166534' },
    cancelled:  { label: 'Cancelled',     bg: '#F9FAFB', color: '#6B7280' },
    picking:    { label: 'In production', bg: '#F5F3FF', color: '#6D28D9' },
  }
  const s = map[status] ?? { label: status, bg: '#F9FAFB', color: '#6B7280' }
  return (
    <span style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

async function findOrderByNumber(orderNumber: string): Promise<Order | null> {
  const q = query(collection(db, 'orders'), where('orderNumber', '==', orderNumber.toUpperCase().trim()))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  const data = d.data() as any
  return {
    ...data,
    id:          d.id,
    createdAt:   data.createdAt?.toDate(),
    updatedAt:   data.updatedAt?.toDate(),
    deliveryDate: data.deliveryDate?.toDate(),
    expectedDeliveryDate: data.expectedDeliveryDate?.toDate(),
  } as Order
}

export default function TrackOrderPage() {
  const params     = useParams<{ orderNumber: string }>()
  const router     = useRouter()
  const [input,    setInput]    = useState(params.orderNumber?.toUpperCase() ?? '')
  const [order,    setOrder]    = useState<Order | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [genDN,    setGenDN]    = useState(false)
  const [genINV,   setGenINV]   = useState(false)

  useEffect(() => {
    if (params.orderNumber) lookup(params.orderNumber)
  }, [params.orderNumber])

  async function lookup(num?: string) {
    const n = (num ?? input).trim().toUpperCase()
    if (!n) return
    setLoading(true)
    setNotFound(false)
    setOrder(null)
    try {
      const o = await findOrderByNumber(n)
      if (!o) { setNotFound(true); return }
      setOrder(o)
      if (!params.orderNumber) router.replace(`/track/${n}`)
    } finally { setLoading(false) }
  }

  async function generateDoc(type: 'dn' | 'inv') {
    if (!order) return
    type === 'dn' ? setGenDN(true) : setGenINV(true)
    try {
      const [{ pdf }, { default: React }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
      ])

      let blob: Blob
      let filename: string

      if (type === 'dn') {
        const { DeliveryNotePDF } = await import('@/lib/pdf/deliveryNote')
        const dnNumber = order.deliveryNoteNumber ?? `DN-${order.orderNumber.replace('FL-', '')}`
        blob = await pdf(React.createElement(DeliveryNotePDF, {
          order: { ...order, deliveryNoteNumber: dnNumber },
          legalName: order.accountName,
        })).toBlob()
        filename = `${dnNumber}.pdf`
      } else {
        const { InvoicePDF } = await import('@/lib/pdf/invoice')
        blob = await pdf(React.createElement(InvoicePDF, { order })).toBlob()
        filename = `${order.invoiceNumber ?? order.orderNumber}-Invoice.pdf`
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error(e) }
    finally { type === 'dn' ? setGenDN(false) : setGenINV(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px 40px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Foodlab Cocktails</p>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Order tracking</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>Enter your order number to view status and download documents</p>
      </div>

      {/* Search */}
      <div style={{ width: '100%', maxWidth: '480px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder="e.g. FL-2026-0001"
            style={{
              flex: 1, padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px',
              fontSize: '15px', outline: 'none', background: '#fff', letterSpacing: '0.05em',
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={() => lookup()}
            disabled={loading}
            style={{
              padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#111827',
              color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '...' : 'Track'}
          </button>
        </div>

        {notFound && (
          <p style={{ fontSize: '13px', color: '#dc2626', margin: '10px 0 0 4px' }}>
            Order not found. Check the number and try again.
          </p>
        )}
      </div>

      {/* Order card */}
      {order && (
        <div style={{ width: '100%', maxWidth: '560px', background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>

          {/* Header row */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 4px', fontFamily: 'monospace' }}>{order.orderNumber}</p>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{order.accountName}</p>
            </div>
            <StatusPill status={order.status} />
          </div>

          {/* Details grid */}
          <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', borderBottom: '1px solid #f3f4f6' }}>
            {[
              ['Order date',    format(order.createdAt, 'd MMM yyyy')],
              order.poReference ? ['Your PO ref', order.poReference] : null,
              order.expectedDeliveryDate ? ['Expected delivery', format(order.expectedDeliveryDate, 'd MMM yyyy')] : null,
              order.deliveryDate ? ['Delivered', format(order.deliveryDate, 'd MMM yyyy')] : null,
              order.invoiceNumber ? ['Invoice', order.invoiceNumber] : null,
            ].filter(Boolean).map(([l, v]) => (
              <div key={String(l)}>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</p>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827', margin: 0 }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Items</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {order.lineItems.map(item => (
                <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#374151' }}>{item.productName}</span>
                  <span style={{ color: '#6b7280', fontFamily: 'monospace' }}>{item.quantity}L · £{item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, color: '#111827' }}>
              <span>Total (inc. VAT)</span>
              <span>£{order.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Download buttons */}
          <div style={{ padding: '16px 24px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => generateDoc('dn')}
              disabled={genDN}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', fontSize: '13px', fontWeight: 500, color: '#374151', cursor: 'pointer', opacity: genDN ? 0.6 : 1 }}
            >
              {genDN ? 'Generating...' : 'Download delivery note'}
            </button>
            <button
              onClick={() => generateDoc('inv')}
              disabled={genINV || !order.invoiceNumber}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', fontSize: '13px', fontWeight: 500, color: order.invoiceNumber ? '#374151' : '#9ca3af', cursor: order.invoiceNumber ? 'pointer' : 'not-allowed', opacity: genINV ? 0.6 : 1 }}
            >
              {genINV ? 'Generating...' : order.invoiceNumber ? 'Download invoice' : 'Invoice pending'}
            </button>
          </div>
        </div>
      )}

      <p style={{ fontSize: '12px', color: '#d1d5db', marginTop: '40px' }}>Foodlab Cocktails · London</p>
    </div>
  )
}