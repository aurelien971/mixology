'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { getOrder, updateOrder } from '@/lib/firestore/orders'
import { getAccount } from '@/lib/firestore/accounts'
import { getCompanySettings } from '@/lib/firestore/settings'
import { uploadSignedDeliveryNote } from '@/lib/storage'
import { Order, Account } from '@/types'
import toast from 'react-hot-toast'

export default function SignDeliveryNotePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [order, setOrder]     = useState<Order | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  const [boxesPacked, setBoxesPacked] = useState('')
  const [packedBy, setPackedBy]       = useState('')
  const [receivedBy, setReceivedBy]   = useState('')
  const [hasSignature, setHasSignature] = useState(false)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const drawingRef  = useRef(false)
  const lastPosRef  = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    async function load() {
      const o = await getOrder(id)
      setOrder(o)
      if (o) {
        const [a, s] = await Promise.all([getAccount(o.accountId), getCompanySettings()])
        setAccount(a)
        setSettings(s)
      }
      setLoading(false)
    }
    load()
  }, [id])

  // ── Canvas drawing ──────────────────────────────────────────────────────────
  function getPos(e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    drawingRef.current = true
    const canvas = canvasRef.current!
    lastPosRef.current = getPos(e, canvas)
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    if (!drawingRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current!.x, lastPosRef.current!.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPosRef.current = pos
    setHasSignature(true)
  }

  function stopDraw() { drawingRef.current = false }

  function clearSignature() {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleSubmit() {
    if (!order || !account || !settings) return
    if (!boxesPacked.trim()) return toast.error('Enter number of boxes')
    if (!packedBy.trim())    return toast.error('Enter packed by name')
    if (!receivedBy.trim())  return toast.error('Enter received by name')
    if (!hasSignature)       return toast.error('Please sign before submitting')

    setSaving(true)
    try {
      // Get signature as base64 PNG
      const canvas = canvasRef.current!
      const signatureData = canvas.toDataURL('image/png')
      const signedAt = new Date()

      // Generate PDF with filled-in fields
      const [{ pdf }, DNModule, { default: React }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/pdf/deliveryNote'),
        import('react'),
      ])
      const DeliveryNotePDF = DNModule.DeliveryNotePDF ?? DNModule.default
      const dnNumber = order.deliveryNoteNumber ?? `DN-${order.orderNumber.replace('FL-', '')}`

      const blob = await pdf(React.createElement(DeliveryNotePDF, {
        order: { ...order, deliveryNoteNumber: dnNumber },
        legalName:       account?.legalName,
        tradingName:     account?.tradingName,
        address:         account?.address,
        supplierName:    settings.supplierName,
        supplierAddress: settings.supplierAddress,
        supplierPhone:   settings.supplierPhone,
        boxesPacked:     boxesPacked.trim(),
        packedBy:        packedBy.trim(),
        receivedBy:      receivedBy.trim(),
        signatureData,
        signedAt,
      } as any) as any).toBlob()

      // Upload as signed delivery note
      const file = new File([blob], `signed-dn-${dnNumber}.pdf`, { type: 'application/pdf' })
      const url  = await uploadSignedDeliveryNote(id, file)
      await updateOrder(id, {
        signedDeliveryNoteUrl: url,
        status: order.status === 'received' || order.status === 'production' ? 'dispatched' : order.status,
      })

      setDone(true)
      toast.success('Signed delivery note saved!')
    } catch (e) {
      console.error(e)
      toast.error('Failed to save — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading order...</p>
    </div>
  )

  if (!order) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>Order not found</p>
    </div>
  )

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', padding: '32px', textAlign: 'center' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>✓</div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#166534', margin: '0 0 8px' }}>Delivery confirmed</h1>
      <p style={{ fontSize: '15px', color: '#4b7c5e', margin: '0 0 24px' }}>Signed delivery note saved for {order.orderNumber}</p>
      <button
        onClick={() => router.push(`/orders/${id}`)}
        style={{ padding: '12px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 600, background: '#166534', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        Back to order
      </button>
    </div>
  )

  const inp = (label: string, value: string, onChange: (v: string) => void, placeholder = '') => (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontSize: '16px', outline: 'none', boxSizing: 'border-box', background: '#fff', WebkitAppearance: 'none' }}
      />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', paddingBottom: '40px' }}>

      {/* Header */}
      <div style={{ background: '#111827', color: '#fff', padding: '20px 20px 16px' }}>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 4px' }}>{order.orderNumber}</p>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>Delivery note</h1>
        <p style={{ fontSize: '14px', color: '#d1d5db', margin: 0 }}>{account?.tradingName ?? order.accountName} · {format(new Date(), 'd MMM yyyy')}</p>
      </div>

      {/* Order summary */}
      <div style={{ background: '#fff', margin: '16px', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', background: '#f9fafb' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Order contents</p>
        </div>
        {order.lineItems.map((item, i) => (
          <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{item.productName}</p>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{item.productCode}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{item.quantity * (item.volumeLitres ?? 5)}L</p>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{item.quantity} × {item.volumeLitres ?? 5}L</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form fields */}
      <div style={{ margin: '0 16px 16px', background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>Packing details</p>
        {inp('No. of boxes packed *', boxesPacked, setBoxesPacked, 'e.g. 3')}
        {inp('Packed by *', packedBy, setPackedBy, 'Your name')}
        {inp('Received by *', receivedBy, setReceivedBy, 'Client name')}
      </div>

      {/* Signature pad */}
      <div style={{ margin: '0 16px 24px', background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Client signature *</p>
          {hasSignature && (
            <button onClick={clearSignature} style={{ fontSize: '13px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
          )}
        </div>
        <div style={{ border: `2px solid ${hasSignature ? '#111827' : '#e5e7eb'}`, borderRadius: '12px', overflow: 'hidden', background: '#fafafa', touchAction: 'none' }}>
          <canvas
            ref={canvasRef}
            width={340}
            height={160}
            style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>
        {!hasSignature && (
          <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', margin: '8px 0 0' }}>Sign above with your finger</p>
        )}
      </div>

      {/* Submit */}
      <div style={{ padding: '0 16px' }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            width: '100%', padding: '18px', borderRadius: '14px', fontSize: '17px', fontWeight: 700,
            background: saving ? '#9ca3af' : '#111827', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Confirm delivery & save'}
        </button>
        <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', margin: '12px 0 0' }}>
          This will save a signed PDF and mark the order as dispatched
        </p>
      </div>
    </div>
  )
}