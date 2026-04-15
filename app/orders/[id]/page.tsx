'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format, isPast } from 'date-fns'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge, { orderStatusBadge, paymentStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getOrder, updateOrderStatus, updateOrder } from '@/lib/firestore/orders'
import { getPaymentByOrder, markPaymentPaid, updatePaymentStatus, updatePaymentDueDate } from '@/lib/firestore/payments'
import { getAccount } from '@/lib/firestore/accounts'
import { getCompanySettings } from '@/lib/firestore/settings'
import { Order, OrderStatus, Payment, Account, PAYMENT_TERMS_LABELS } from '@/types'
import toast from 'react-hot-toast'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'received',   label: 'Received' },
  { status: 'production', label: 'In production' },
  { status: 'dispatched', label: 'Dispatched' },
  { status: 'delivered',  label: 'Delivered' },
]

const STEP_INDEX: Record<string, number> = {
  received: 0, production: 1, dispatched: 2, delivered: 3, cancelled: -1, picking: 1,
}

const NEXT_ACTION: Partial<Record<string, string>> = {
  received:   'Mark in production',
  production: 'Mark dispatched',
  dispatched: 'Mark delivered',
}

const NEXT_STATUS: Partial<Record<string, OrderStatus>> = {
  received:   'production',
  production: 'dispatched',
  dispatched: 'delivered',
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order,   setOrder]   = useState<Order | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [genDN,  setGenDN]   = useState(false)
  const [genINV, setGenINV]  = useState(false)
  const [editDue,  setEditDue]  = useState(false)
  const [newDue,   setNewDue]   = useState('')
  const [editEDD,  setEditEDD]  = useState(false)
  const [newEDD,   setNewEDD]   = useState('')

  async function load() {
    try {
      const o = await getOrder(id)
      setOrder(o)
      if (o) {
        const [p, a] = await Promise.all([getPaymentByOrder(id), getAccount(o.accountId)])
        setPayment(p)
        setAccount(a)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  async function advanceStatus() {
    if (!order) return
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setUpdating(true)
    try {
      await updateOrderStatus(id, next, next === 'delivered' ? { deliveryDate: new Date() } : undefined)
      toast.success(`Order marked as ${next.replace('_', ' ')}`)
      load()
    } catch { toast.error('Failed') }
    finally { setUpdating(false) }
  }

  async function cancelOrder() {
    if (!order || !confirm('Cancel this order?')) return
    setUpdating(true)
    try { await updateOrderStatus(id, 'cancelled'); toast.success('Order cancelled'); load() }
    finally { setUpdating(false) }
  }

  async function handleMarkPaid() {
    if (!payment) return
    setUpdating(true)
    try { await markPaymentPaid(payment.id); toast.success('Marked as paid'); load() }
    catch { toast.error('Failed') } finally { setUpdating(false) }
  }

  async function handleMarkOverdue() {
    if (!payment) return
    setUpdating(true)
    try { await updatePaymentStatus(payment.id, 'overdue'); toast.success('Marked as overdue'); load() }
    catch { toast.error('Failed') } finally { setUpdating(false) }
  }

  async function handleUpdateDueDate() {
    if (!payment || !newDue) return
    setUpdating(true)
    try { await updatePaymentDueDate(payment.id, new Date(newDue)); toast.success('Due date updated'); setEditDue(false); load() }
    catch { toast.error('Failed') } finally { setUpdating(false) }
  }

  async function handleUpdateEDD() {
    if (!order || !newEDD) return
    setUpdating(true)
    try { await updateOrder(id, { expectedDeliveryDate: new Date(newEDD) }); toast.success('Expected delivery date updated'); setEditEDD(false); load() }
    catch { toast.error('Failed') } finally { setUpdating(false) }
  }

  async function generateDeliveryNote() {
    if (!order) return
    setGenDN(true)
    try {
      const [{ pdf }, DNModule, { default: React }, settings] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/pdf/deliveryNote'),
        import('react'),
        getCompanySettings(),
      ])
      const DeliveryNotePDF = DNModule.DeliveryNotePDF ?? DNModule.default
      const dnNumber = `DN-${order.orderNumber.replace('FL-', '')}`
      const blob = await pdf(React.createElement(DeliveryNotePDF, {
        order: { ...order, deliveryNoteNumber: dnNumber },
        legalName:    account?.legalName,
        tradingName:  account?.tradingName,
        address:      account?.address,
        supplierName:    settings.supplierName,
        supplierAddress: settings.supplierAddress,
        supplierPhone:   settings.supplierPhone,
      })).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${dnNumber}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Delivery note downloaded')
    } catch (e) { console.error(e); toast.error('Failed to generate') }
    finally { setGenDN(false) }
  }

  async function generateInvoice() {
    if (!order) return
    setGenINV(true)
    try {
      const [{ pdf }, INVModule, { default: React }, settings] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/pdf/invoice'),
        import('react'),
        getCompanySettings(),
      ])
      const InvoicePDF = INVModule.InvoicePDF ?? INVModule.default
      const termsDays = account?.paymentTerms
        ? ({ net_14:14, net_30:30, net_60:60, upfront:0, split_50:30 } as Record<string, number>)[account.paymentTerms] ?? 30
        : 30
      const blob = await pdf(React.createElement(InvoicePDF, {
        order,
        paymentTermsDays: termsDays,
        supplierName:    settings.supplierName,
        supplierAddress: settings.supplierAddress,
        bankDetails: settings.bankAccountName ? {
          accountName:   settings.bankAccountName,
          sortCode:      settings.bankSortCode,
          accountNumber: settings.bankAccountNumber,
          reference:     settings.bankReference || order.invoiceNumber || order.orderNumber,
        } : undefined,
      })).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${order.invoiceNumber ?? 'Invoice'}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Invoice downloaded')
    } catch (e) { console.error(e); toast.error('Failed to generate') }
    finally { setGenINV(false) }
  }

  function buildReminderEmail() {
    if (!order || !payment || !account) return
    const subject = `Payment reminder — ${payment.invoiceNumber}`
    const due = format(payment.dueDate, 'd MMMM yyyy')
    const body = `Hi,\n\nThis is a friendly reminder that invoice ${payment.invoiceNumber} for £${payment.amount.toFixed(2)} is due on ${due}.\n\nOrder reference: ${order.orderNumber}${order.poReference ? `\nYour PO reference: ${order.poReference}` : ''}\n\nPlease arrange payment at your earliest convenience.\n\nThanks,\nFoodlab Cocktails`
    window.open(`mailto:${account.billingEmail ?? account.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  if (loading) return <p style={{ color: '#9ca3af', marginTop: '2rem', fontSize: '13px' }}>Loading...</p>
  if (!order)  return <p style={{ color: '#9ca3af', marginTop: '2rem', fontSize: '13px' }}>Order not found. <Link href="/orders">← Back</Link></p>

  const badge       = orderStatusBadge(order.status)
  const currentStep = STEP_INDEX[order.status] ?? 0
  const cancelled   = order.status === 'cancelled'
  const payBadge    = payment ? paymentStatusBadge(payment.status) : null
  const isOverdue   = payment && payment.status !== 'paid' && isPast(payment.dueDate)
  const canAdvance  = !!NEXT_ACTION[order.status]

  const s = (color: string, bg: string, border: string) =>
    ({ color, background: bg, border: `1px solid ${border}` } as React.CSSProperties)

  return (
    <div>
      <Header
        title={order.orderNumber}
        subtitle={`${account ? `${account.legalName} (${account.tradingName})` : order.accountName} · ${format(order.createdAt, 'd MMM yyyy')}`}
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            {!cancelled && order.status !== 'delivered' && (
              <Button variant="secondary" size="sm" onClick={cancelOrder} loading={updating}>Cancel</Button>
            )}
            {canAdvance && (
              <Button size="sm" onClick={advanceStatus} loading={updating}>
                {NEXT_ACTION[order.status]}
              </Button>
            )}
          </div>
        }
      />

      {/* Status pipeline */}
      {!cancelled ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px 28px', marginBottom: '24px', display: 'flex', alignItems: 'center' }}>
          {STEPS.map((step, i) => {
            const done   = currentStep > i
            const active = currentStep === i
            return (
              <div key={step.status} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: done || active ? '#111827' : '#f3f4f6',
                    border: `2px solid ${done || active ? '#111827' : '#e5e7eb'}`,
                  }}>
                    {done ? (
                      <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                        <path d="M1 5L4.5 8.5L12 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: active ? 'white' : '#d1d5db' }} />
                    )}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: active ? 600 : 400, color: active ? '#111827' : done ? '#6b7280' : '#9ca3af', whiteSpace: 'nowrap' }}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: '2px', background: done ? '#111827' : '#e5e7eb', margin: '0 8px', marginBottom: '18px' }} />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '24px' }}>
          <p style={{ fontSize: '13px', color: '#991b1b', fontWeight: 500, margin: 0 }}>This order has been cancelled</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', maxWidth: '1020px' }}>

        {/* LEFT col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Order lines */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Order lines</h3>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{order.lineItems.length} product{order.lineItems.length !== 1 ? 's' : ''}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', color: '#9ca3af', fontSize: '11px' }}>
                  {['Product', 'Price / L', 'Litres', 'Total'].map((h, hi) => (
                    <th key={h} style={{ padding: '8px 20px', fontWeight: 500, textAlign: hi === 0 ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.lineItems.map((item) => (
                  <tr key={item.productId} style={{ borderTop: '1px solid #f9fafb' }}>
                    <td style={{ padding: '10px 20px' }}>
                      <p style={{ fontWeight: 500, color: '#111827', margin: 0 }}>{item.productName}</p>
                      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{item.productCode}</p>
                    </td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', color: '#6b7280' }}>£{item.unitPrice.toFixed(2)}</td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', color: '#6b7280' }}>{item.quantity}L</td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>£{item.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '12px 20px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', fontSize: '13px' }}>
              {[['Subtotal', `£${order.subtotal.toFixed(2)}`], ['VAT (20%)', `£${order.vatAmount.toFixed(2)}`]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginBottom: '4px' }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#111827', paddingTop: '8px', borderTop: '1px solid #e5e7eb', marginTop: '4px', fontSize: '14px' }}>
                <span>Total</span><span>£{order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment */}
          {payment && (
            <div style={{ background: isOverdue ? '#fef2f2' : '#fff', borderRadius: '14px', border: `1px solid ${isOverdue ? '#fecaca' : '#f3f4f6'}`, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Payment</h3>
                {payBadge && <Badge label={payBadge.label} variant={payBadge.variant} />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', fontSize: '13px' }}>
                {[
                  ['Invoice', payment.invoiceNumber],
                  ['Amount', `£${payment.amount.toFixed(2)}`],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</p>
                    <p style={{ fontWeight: 600, color: '#111827', margin: 0 }}>{v}</p>
                  </div>
                ))}
                <div>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due date</p>
                  {editDue ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} style={{ fontSize: '12px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', outline: 'none' }} />
                      <button onClick={handleUpdateDueDate} style={{ fontSize: '12px', color: '#166534', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                      <button onClick={() => setEditDue(false)} style={{ fontSize: '12px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontWeight: 600, color: isOverdue ? '#991b1b' : '#111827', margin: 0 }}>
                        {format(payment.dueDate, 'd MMM yyyy')}{isOverdue ? ' — overdue' : ''}
                      </p>
                      {payment.status !== 'paid' && (
                        <button onClick={() => { setEditDue(true); setNewDue(format(payment.dueDate, 'yyyy-MM-dd')) }} style={{ fontSize: '11px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>edit</button>
                      )}
                    </div>
                  )}
                </div>
                {payment.paidDate && (
                  <div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid on</p>
                    <p style={{ fontWeight: 600, color: '#166534', margin: 0 }}>{format(payment.paidDate, 'd MMM yyyy')}</p>
                  </div>
                )}
                {account && (
                  <div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Terms</p>
                    <p style={{ fontWeight: 500, color: '#374151', margin: 0 }}>{PAYMENT_TERMS_LABELS[account.paymentTerms]}</p>
                  </div>
                )}
              </div>
              {payment.status !== 'paid' && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button size="sm" onClick={handleMarkPaid} loading={updating}>Mark as paid</Button>
                  {!isOverdue && <Button size="sm" variant="secondary" onClick={handleMarkOverdue}>Mark as overdue</Button>}
                  <Button size="sm" variant="secondary" onClick={buildReminderEmail}>Send reminder</Button>
                </div>
              )}
            </div>
          )}

          {/* Client info */}
          {account && (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Client</h3>
                <Link href={`/accounts/${account.id}`} style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '3px 10px' }}>
                  View account →
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                {[
                  ['Legal entity',   account.legalName],
                  ['Trading as',     account.tradingName],
                  ['Email',          account.billingEmail ?? account.email],
                  ['Phone',          account.phone ?? '—'],
                  ['Address',        [account.address.line1, account.address.line2, account.address.city, account.address.postcode].filter(Boolean).join(', ') || '—'],
                  ['VAT number',     account.vatNumber ?? '—'],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</p>
                    <p style={{ color: '#374151', margin: 0, wordBreak: 'break-word' }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.notes && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</p>
              <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>{order.notes}</p>
            </div>
          )}
        </div>

        {/* RIGHT sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Order info */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '16px 18px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Order info</p>
            <dl style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <dt style={{ color: '#9ca3af' }}>Status</dt>
                <dd style={{ margin: 0 }}><Badge label={badge.label} variant={badge.variant} /></dd>
              </div>
              {[
                ['Created',  format(order.createdAt, 'd MMM yyyy')],
                order.poReference ? ['PO ref', order.poReference] : null,
                order.invoiceNumber ? ['Invoice', order.invoiceNumber] : null,
                order.deliveryDate ? ['Delivered', format(order.deliveryDate, 'd MMM yyyy')] : null,
              ].filter(Boolean).map(([l, v]) => (
                <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <dt style={{ color: '#9ca3af' }}>{l}</dt>
                  <dd style={{ color: '#374151', margin: 0 }}>{v}</dd>
                </div>
              ))}

              {/* Expected delivery date */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editEDD ? '8px' : 0 }}>
                  <dt style={{ color: '#9ca3af', fontSize: '13px' }}>Expected delivery</dt>
                  {!editEDD && (
                    <button onClick={() => { setEditEDD(true); setNewEDD(order.expectedDeliveryDate ? format(order.expectedDeliveryDate, 'yyyy-MM-dd') : '') }}
                      style={{ fontSize: '11px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      {order.expectedDeliveryDate ? 'edit' : 'set'}
                    </button>
                  )}
                </div>
                {editEDD ? (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="date" value={newEDD} onChange={e => setNewEDD(e.target.value)} style={{ flex: 1, fontSize: '12px', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', outline: 'none' }} />
                    <button onClick={handleUpdateEDD} style={{ fontSize: '12px', color: '#166534', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                    <button onClick={() => setEditEDD(false)} style={{ fontSize: '12px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                  </div>
                ) : order.expectedDeliveryDate ? (
                  <dd style={{ color: '#374151', margin: 0, fontSize: '13px' }}>{format(order.expectedDeliveryDate, 'd MMM yyyy')}</dd>
                ) : (
                  <dd style={{ color: '#d1d5db', margin: 0, fontSize: '12px', fontStyle: 'italic' }}>Not set</dd>
                )}
              </div>
            </dl>
          </div>

          {/* Documents */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '16px 18px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Documents</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Download delivery note', loading: genDN, action: generateDeliveryNote },
                { label: 'Download invoice',        loading: genINV, action: generateInvoice },
              ].map(({ label, loading: l, action }) => (
                <button
                  key={label}
                  onClick={action}
                  disabled={l || cancelled}
                  style={{
                    width: '100%', padding: '9px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    border: '1px solid #e5e7eb', background: '#fff', cursor: cancelled || l ? 'not-allowed' : 'pointer',
                    color: cancelled ? '#9ca3af' : '#374151', textAlign: 'left' as const, opacity: cancelled ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {l ? 'Generating...' : label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <Link href="/orders" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>← Back to orders</Link>
          </div>
        </div>
      </div>
    </div>
  )
}