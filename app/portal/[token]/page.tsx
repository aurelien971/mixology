'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { collection, getDocs, addDoc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { format, addDays, isWeekend, startOfDay } from 'date-fns'
import toast, { Toaster } from 'react-hot-toast'

interface PortalPricing {
  productId: string
  productCode: string
  productName: string
  volumeLitres: number
  pricePerUnit: number
  pricePerLitre: number
  recommendedServingG: number
  rrp: number
}

const VAT = 0.20

function r2(n: number) { return Math.round(n * 100) / 100 }

// Add N business days to a date
function addBusinessDays(date: Date, days: number): Date {
  let d = new Date(date)
  let added = 0
  while (added < days) {
    d = addDays(d, 1)
    if (!isWeekend(d)) added++
  }
  return d
}

// Min delivery date = 4 business days from today
function getMinDeliveryDate(): Date {
  return addBusinessDays(startOfDay(new Date()), 4)
}

function toDateInputValue(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

async function getNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const snap = await getDocs(collection(db, 'orders'))
  const num  = snap.size + 1
  return `FL-${year}-${String(num).padStart(4, '0')}`
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [accountId, setAccountId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [legalName, setLegalName]     = useState('')
  const [groupId, setGroupId]         = useState<string | undefined>()
  const [groupName, setGroupName]     = useState<string | undefined>()
  const [paymentTerms, setPaymentTerms] = useState('net_30')
  const [pricing, setPricing]   = useState<PortalPricing[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [contactName, setContactName] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState('')

  const minDate = useMemo(() => toDateInputValue(getMinDeliveryDate()), [])

  useEffect(() => {
    async function load() {
      try {
        const accountSnap = await getDocs(
          query(collection(db, 'accounts'), where('clientToken', '==', token))
        )
        if (accountSnap.empty) { setError('Invalid or expired link.'); setLoading(false); return }

        const doc     = accountSnap.docs[0]
        const account = doc.data() as any
        setAccountId(doc.id)
        setAccountName(account.tradingName)
        setLegalName(account.legalName)
        setGroupId(account.groupId)
        setGroupName(account.groupName)
        setPaymentTerms(account.paymentTerms ?? 'net_30')

        const pricingSnap = await getDocs(
          query(collection(db, 'accountPricing'), where('accountId', '==', doc.id))
        )
        const items: PortalPricing[] = pricingSnap.docs
          .map(d => d.data() as any)
          .sort((a, b) => a.productName.localeCompare(b.productName))
        setPricing(items)
      } catch (e) {
        setError('Failed to load. Please try again.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  function setQty(productId: string, val: number) {
    setQuantities(prev => ({ ...prev, [productId]: Math.max(0, Math.round(val)) }))
  }

  const cart = pricing.filter(p => (quantities[p.productId] ?? 0) > 0).map(p => ({
    productId:    p.productId,
    productCode:  p.productCode,
    productName:  p.productName,
    volumeLitres: p.volumeLitres,
    unitPrice:    p.pricePerUnit,
    quantity:     quantities[p.productId],
    lineTotal:    r2(quantities[p.productId] * p.pricePerUnit),
    servingSizeG: p.recommendedServingG,
  }))

  const subtotal = r2(cart.reduce((s, l) => s + l.lineTotal, 0))
  const vatAmt   = r2(subtotal * VAT)
  const total    = r2(subtotal + vatAmt)

  const canSubmit = contactName.trim() && deliveryDate && cart.length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const orderNumber   = await getNextOrderNumber()
      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`
      const termsDays     = paymentTerms === 'net_14' ? 14 : paymentTerms === 'net_60' ? 60 : 30
      const dueDate       = addDays(new Date(), termsDays)

      const orderData: any = {
        orderNumber,
        invoiceNumber,
        accountId,
        accountName,
        lineItems:  cart,
        subtotal,
        vatRate:    VAT,
        vatAmount:  vatAmt,
        total,
        status:     'received',
        source:     'client_portal',
        portalContactName: contactName.trim(),
        expectedDeliveryDate: Timestamp.fromDate(new Date(deliveryDate)),
        notes: `Portal order from ${contactName.trim()}${notes.trim() ? `. ${notes.trim()}` : ''}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }
      if (groupId)   orderData.groupId   = groupId
      if (groupName) orderData.groupName = groupName

      const orderRef = await addDoc(collection(db, 'orders'), orderData)

      await addDoc(collection(db, 'payments'), {
        orderId:     orderRef.id,
        orderNumber,
        accountId,
        accountName,
        invoiceNumber,
        amount:      total,
        dueDate:     Timestamp.fromDate(dueDate),
        status:      'pending',
        createdAt:   Timestamp.now(),
        updatedAt:   Timestamp.now(),
      })

      setSubmitted(orderNumber)
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to place order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading / Error / Success screens ──────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading your portal...</p>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: '32px', textAlign: 'center' }}>
      <div>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔗</p>
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>{error}</p>
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Contact Foodlab Cocktails for a new link.</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', padding: '40px 24px', textAlign: 'center' }}>
      <Toaster />
      <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M8 18l7 7 13-13" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#166534', margin: '0 0 10px' }}>Order placed!</h1>
      <p style={{ fontSize: '15px', color: '#4b7c5e', margin: '0 0 6px' }}>Reference: <strong>{submitted}</strong></p>
      <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '320px', lineHeight: 1.6, margin: '0 0 28px' }}>
        We've received your order and will be in touch to confirm. Expected delivery: {format(new Date(deliveryDate), 'd MMMM yyyy')}.
      </p>
      <button
        onClick={() => { setSubmitted(''); setQuantities({}); setContactName(''); setDeliveryDate(''); setNotes('') }}
        style={{ padding: '11px 28px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, background: '#166534', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        Place another order
      </button>
    </div>
  )

  // ── Main portal ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <Toaster position="top-center" />

      {/* Header */}
      <div style={{ background: '#111827', color: '#fff', padding: '22px 24px 18px' }}>
        <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Foodlab Cocktails</p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.3px' }}>{accountName}</h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Order portal</p>
      </div>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* Instructions */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px 20px', marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 4px', lineHeight: 1.6, fontWeight: 500 }}>Place your order below</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
            Select quantities, choose a delivery date (minimum 4 business days) and enter your name to submit. All prices are ex-VAT.
          </p>
        </div>

        {/* Product list */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '10px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'grid', gridTemplateColumns: '1fr 90px 110px', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cocktail</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' as const }}>Price / bag</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' as const }}>Qty</span>
          </div>

          {pricing.map((p, i) => {
            const qty = quantities[p.productId] ?? 0
            return (
              <div key={p.productId} style={{
                padding: '14px 20px',
                borderBottom: i < pricing.length - 1 ? '1px solid #f9fafb' : 'none',
                display: 'grid', gridTemplateColumns: '1fr 90px 110px', gap: '8px', alignItems: 'center',
                background: qty > 0 ? '#f0fdf4' : '#fff', transition: 'background 0.15s',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{p.productName}</p>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f3f4f6', color: '#374151' }}>{p.volumeLitres}L</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{p.productCode}</p>
                </div>

                <div style={{ textAlign: 'right' as const }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>£{p.pricePerUnit.toFixed(2)}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '1px 0 0' }}>£{r2(p.pricePerUnit / p.volumeLitres).toFixed(2)}/L</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                  <button
                    onClick={() => setQty(p.productId, qty - 1)}
                    disabled={qty === 0}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      border: `1px solid ${qty === 0 ? '#f3f4f6' : '#e5e7eb'}`,
                      background: qty === 0 ? '#f9fafb' : '#fff',
                      color: qty === 0 ? '#d1d5db' : '#374151',
                      fontSize: '18px', lineHeight: 1, cursor: qty === 0 ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
                    }}
                  >−</button>
                  <span style={{ width: '24px', textAlign: 'center' as const, fontSize: '16px', fontWeight: 700, color: qty > 0 ? '#166534' : '#111827' }}>{qty}</span>
                  <button
                    onClick={() => setQty(p.productId, qty + 1)}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                      fontSize: '18px', lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
                    }}
                  >+</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Order details form */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '20px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 16px' }}>Order details</p>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Your name *</label>
            <input
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="e.g. James"
              style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${contactName.trim() ? '#111827' : '#e5e7eb'}`, borderRadius: '9px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Requested delivery date * <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>— minimum 4 business days</span>
            </label>
            <input
              type="date"
              min={minDate}
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${deliveryDate ? '#111827' : '#e5e7eb'}`, borderRadius: '9px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Notes <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Special instructions, access info..."
              rows={3}
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '14px', outline: 'none', resize: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
        </div>

        {/* Summary + submit — only show when there are items */}
        {cart.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '20px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>Order summary</p>
            {cart.map(item => (
              <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#374151' }}>{item.productName} <span style={{ color: '#9ca3af' }}>× {item.quantity}</span></span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>£{item.lineTotal.toFixed(2)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #f3f4f6', margin: '12px 0 10px', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>Subtotal (ex-VAT)</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>£{subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>VAT (20%)</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>£{vatAmt.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>Total inc. VAT</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>£{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Submit button — only visible when all filled */}
        {canSubmit && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '17px', borderRadius: '12px', fontSize: '16px', fontWeight: 700,
              background: submitting ? '#9ca3af' : '#111827', color: '#fff',
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            }}
          >
            {submitting ? 'Placing order...' : `Place order · £${total.toFixed(2)} inc. VAT`}
          </button>
        )}

        {/* Helper text when not ready */}
        {!canSubmit && (
          <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#9ca3af' }}>
            {cart.length === 0 && 'Add at least one product to continue'}
            {cart.length > 0 && !contactName.trim() && 'Enter your name to continue'}
            {cart.length > 0 && contactName.trim() && !deliveryDate && 'Choose a delivery date to continue'}
          </div>
        )}
      </div>
    </div>
  )
}