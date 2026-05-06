'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, isPast } from 'date-fns'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge, { orderStatusBadge, paymentStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getOrder, updateOrderStatus, updateOrder, deleteOrder } from '@/lib/firestore/orders'
import { getPaymentByOrder, markPaymentPaid, updatePaymentStatus, updatePaymentDueDate } from '@/lib/firestore/payments'
import { getAccount } from '@/lib/firestore/accounts'
import EditOrderModal from '@/components/orders/EditOrderModal'
import { getCompanySettings, CompanySettings } from '@/lib/firestore/settings'
import { downloadXeroCSV } from '@/lib/xeroExport'
import { uploadSignedDeliveryNote, deleteSignedDeliveryNote } from '@/lib/storage'
import { Order, OrderStatus, Payment, Account, PAYMENT_TERMS_LABELS } from '@/types'
import toast from 'react-hot-toast'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'received',   label: 'Received' },
  { status: 'production', label: 'In production' },
  { status: 'dispatched', label: 'Dispatched' },
  { status: 'delivered',  label: 'Delivered' },
]

const STEP_INDEX: Record<string, number> = {
  received: 0, production: 1, dispatched: 2, delivered: 3, cancelled: -1,
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
  const router  = useRouter()
  const [order,   setOrder]   = useState<Order | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [genDN,  setGenDN]   = useState(false)
  const [genINV, setGenINV]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [editingOrder, setEditingOrder] = useState(false)
  const [editDue,  setEditDue]  = useState(false)
  const [newDue,   setNewDue]   = useState('')
  const [editEDD,  setEditEDD]  = useState(false)
  const [newEDD,   setNewEDD]   = useState('')

  async function load() {
    try {
      const o = await getOrder(id)
      setOrder(o)
      if (o) {
        const [p, a, s] = await Promise.all([getPaymentByOrder(id), getAccount(o.accountId), getCompanySettings()])
        setPayment(p)
        setAccount(a)
        setSettings(s)
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

  async function handleDeleteOrder() {
    if (!order) return
    if (!confirm(`Permanently delete ${order.orderNumber}? This cannot be undone.`)) return
    setUpdating(true)
    try {
      await deleteOrder(id)
      toast.success('Order deleted')
      router.push('/orders')
    } catch {
      toast.error('Failed to delete order')
      setUpdating(false)
    }
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

  async function handleUploadSignedDN(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !order) return
    setUploading(true)
    setUploadProgress(0)
    try {
      const url = await uploadSignedDeliveryNote(id, file, setUploadProgress)
      await updateOrder(id, { signedDeliveryNoteUrl: url })
      toast.success('Signed delivery note uploaded')
      load()
    } catch (err) {
      console.error(err)
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      e.target.value = ''  // reset input so same file can be re-uploaded
    }
  }

  async function handleDeleteSignedDN() {
    if (!order || !confirm('Remove the signed delivery note?')) return
    setUpdating(true)
    try {
      await deleteSignedDeliveryNote(id)
      await updateOrder(id, { signedDeliveryNoteUrl: undefined })
      toast.success('Signed delivery note removed')
      load()
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove')
    } finally {
      setUpdating(false)
    }
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
      }) as any).toBlob()
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
        legalName:    account?.legalName,
        tradingName:  account?.tradingName,
        billingAddress: account?.address,
        paymentTermsDays: termsDays,
        supplierName:    settings.supplierName,
        supplierAddress: settings.supplierAddress,
        bankDetails: settings.bankAccountName ? {
          accountName:   settings.bankAccountName,
          sortCode:      settings.bankSortCode,
          accountNumber: settings.bankAccountNumber,
          reference:     order.invoiceNumber ?? order.orderNumber,
        } : undefined,
      }) as any).toBlob()
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
      {editingOrder && order && (
        <EditOrderModal
          order={order}
          onClose={() => setEditingOrder(false)}
          onSaved={() => load()}
        />
      )}
      {showConfirmation && order && account && payment && settings && (
        <ConfirmationModal
          order={order}
          account={account}
          payment={payment}
          settings={settings}
          onClose={() => setShowConfirmation(false)}
        />
      )}
      <Header
        title={order.orderNumber}
        subtitle={`${account ? `${account.legalName} (${account.tradingName})` : order.accountName} · ${format(order.createdAt, 'd MMM yyyy')}`}
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            {!cancelled && order.status !== 'delivered' && (
              <Button variant="secondary" size="sm" onClick={cancelOrder} loading={updating}>Cancel</Button>
            )}
            {!cancelled && (
              <Button variant="secondary" size="sm" onClick={() => setEditingOrder(true)}>Edit order</Button>
            )}
            <Button
              variant="secondary" size="sm" onClick={handleDeleteOrder} loading={updating}
              style={{ color: '#dc2626', borderColor: '#fecaca' } as React.CSSProperties}
            >
              Delete
            </Button>
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
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px 28px', marginBottom: '20px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: '380px' }}>
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
        </div>
      ) : (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '24px' }}>
          <p style={{ fontSize: '13px', color: '#991b1b', fontWeight: 500, margin: 0 }}>This order has been cancelled</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', maxWidth: '1020px' }}
        className="md:grid-cols-[1fr_320px]"
      >

        {/* LEFT col */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Order lines */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Order lines</h3>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {order.lineItems.length} product{order.lineItems.length !== 1 ? 's' : ''} · {order.lineItems.reduce((s, l) => s + l.quantity * (l.volumeLitres ?? 5), 0)}L total
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', color: '#9ca3af', fontSize: '11px' }}>
                  {['Product', 'Price / bag', 'Volume', 'Qty', 'Total'].map((h, hi) => (
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
                    <td style={{ padding: '10px 20px', textAlign: 'right', color: '#6b7280' }}>
                      <span style={{ background: '#f3f4f6', padding: '2px 7px', borderRadius: '5px', fontSize: '12px', fontWeight: 500 }}>
                        {item.volumeLitres ?? 5}L
                      </span>
                    </td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', color: '#6b7280' }}>×{item.quantity}</td>
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
              ].filter((x): x is [string, string] => x !== null).map(([l, v]) => (
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

              {/* ── Signed delivery note — FIRST ──────────────────────── */}
              {!cancelled && (
                <>
                  {/* Digital sign */}
                  {!order.signedDeliveryNoteUrl && (
                    <a
                      href={`/orders/${id}/sign`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3',
                        textDecoration: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 10l2-2 6-6 2 2-6 6-2 2-2-2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M8 4l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      Sign delivery note digitally
                    </a>
                  )}

                  {/* View / remove signed note */}
                  {order.signedDeliveryNoteUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <a
                        href={order.signedDeliveryNoteUrl}
                        target="_blank" rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '9px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                          border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534',
                          textDecoration: 'none',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M2 2h8l4 4v8H2V2z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
                          <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                        </svg>
                        View signed note ✓
                      </a>
                      <button
                        onClick={handleDeleteSignedDN}
                        disabled={updating}
                        style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid #fecaca', background: 'transparent', color: '#dc2626', cursor: 'pointer', textAlign: 'left' as const }}
                      >
                        Remove signed note
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '12px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                      border: '1px dashed #d1d5db', background: '#fafafa',
                      color: uploading ? '#9ca3af' : '#374151',
                      cursor: uploading ? 'not-allowed' : 'pointer', minHeight: '48px',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 10V2M5 5l3-3 3 3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {uploading ? `Uploading… ${uploadProgress}%` : 'Upload signed note'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadSignedDN} disabled={uploading} style={{ display: 'none' }} />
                    </label>
                  )}

                  {uploading && (
                    <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#111827', borderRadius: '2px', transition: 'width 0.2s' }} />
                    </div>
                  )}

                  <div style={{ height: '1px', background: '#f3f4f6', margin: '4px 0' }} />
                </>
              )}

              {/* ── Download delivery note + invoice ──────────────────── */}
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

              {/* ── Xero CSV ──────────────────────────────────────────── */}
              <button
                onClick={() => {
                  if (!order) return
                  downloadXeroCSV({
                    order,
                    legalName:    account?.legalName,
                    email:        account?.billingEmail ?? account?.email,
                    addressLine1: account?.address?.line1,
                    addressLine2: account?.address?.line2,
                    city:         account?.address?.city,
                    postcode:     account?.address?.postcode,
                    paymentTermsDays: account?.paymentTerms
                      ? ({ net_14:14, net_30:30, net_60:60, upfront:0, split_50:30 } as Record<string, number>)[account.paymentTerms] ?? 30
                      : 30,
                  })
                }}
                disabled={cancelled}
                style={{
                  width: '100%', padding: '9px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  border: '1px solid #d1fae5', background: '#f0fdf4', cursor: cancelled ? 'not-allowed' : 'pointer',
                  color: cancelled ? '#9ca3af' : '#065f46', textAlign: 'left' as const, opacity: cancelled ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                  <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Export Xero invoice (CSV)
              </button>

              {/* ── Send confirmation ─────────────────────────────────── */}
              {!cancelled && (
                <button
                  onClick={() => setShowConfirmation(true)}
                  style={{
                    width: '100%', padding: '9px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    border: '1px solid #e0e7ff', background: '#eef2ff', cursor: 'pointer',
                    color: '#3730a3', textAlign: 'left' as const,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 3h12l-6 5-6-5zM2 3v9a1 1 0 001 1h10a1 1 0 001-1V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Send order confirmation
                </button>
              )}

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

// ── Order confirmation modal ─────────────────────────────────────────────────

function ConfirmationModal({ order, account, payment, settings, onClose }: {
  order: Order
  account: Account
  payment: Payment
  settings: CompanySettings
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const deliveryDate = order.expectedDeliveryDate ?? order.deliveryDate
  const deliveryStr  = deliveryDate ? format(deliveryDate, 'd MMMM yyyy') : 'TBC'
  const dueStr       = format(payment.dueDate, 'd MMMM yyyy')
  const terms        = PAYMENT_TERMS_LABELS[account.paymentTerms ?? 'net_30'] ?? 'Net 30 days'
  const invoiceNo    = order.invoiceNumber ?? `INV-${order.orderNumber.replace('FL-', '')}`

  const hasBankDetails = !!(settings.bankAccountName && settings.bankSortCode && settings.bankAccountNumber)

  const subject = `Order Confirmation – ${order.orderNumber}${order.poReference ? ` / ${order.poReference}` : ''}`

  const body = `Hi ${account.tradingName},

Thank you for your order. Here is your order confirmation and invoice details.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER CONFIRMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order number:       ${order.orderNumber}${order.poReference ? `\nPO reference:       ${order.poReference}` : ''}
Invoice number:     ${invoiceNo}
Expected delivery:  ${deliveryStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${order.lineItems.map(l => {
  const vol = l.volumeLitres ?? 5
  return `${l.productName} (${l.productCode})\n  ${l.quantity} × ${vol}L bag${l.quantity > 1 ? 's' : ''} = ${l.quantity * vol}L   £${l.lineTotal.toFixed(2)}`
}).join('\n\n')}

─────────────────────────────────────
Subtotal (ex-VAT):  £${order.subtotal.toFixed(2)}
VAT (20%):          £${order.vatAmount.toFixed(2)}
Total:              £${order.total.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Amount due:         £${order.total.toFixed(2)}
Payment terms:      ${terms}
Due date:           ${dueStr}
${hasBankDetails ? `
Bank transfer:
  Account name:     ${settings.bankAccountName}
  Sort code:        ${settings.bankSortCode}
  Account number:   ${settings.bankAccountNumber}
  Reference:        ${invoiceNo}
` : `Reference:          ${invoiceNo}
`}
${settings.bankReference ? settings.bankReference : 'Please quote the invoice number as your payment reference.'}

If you have any questions, please don't hesitate to reach out.

Warm regards,
${settings.supplierName}${settings.supplierPhone ? `\n${settings.supplierPhone}` : ''}${settings.supplierEmail ? `\n${settings.supplierEmail}` : ''}`

  function copy() {
    navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const mailtoHref = `mailto:${account.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '40px', paddingBottom: '40px', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '580px', maxHeight: '88vh', overflow: 'hidden', margin: '0 20px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>Order confirmation</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', background: '#f3f4f6', padding: '2px 8px', borderRadius: '6px', color: '#374151', fontFamily: 'monospace' }}>{order.orderNumber}</span>
                {order.poReference && <span style={{ fontSize: '12px', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', color: '#1d4ed8', fontFamily: 'monospace' }}>{order.poReference}</span>}
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>→ {account.email}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
          </div>
        </div>

        {/* Styled email preview */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          <div style={{
            border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '14px', color: '#1f2937',
          }}>
            {/* Email header bar */}
            <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280' }}>
              <span><strong style={{ color: '#374151' }}>To:</strong> {account.email}</span>
              <span><strong style={{ color: '#374151' }}>Subject:</strong> {subject}</span>
            </div>

            {/* Email body */}
            <div style={{ padding: '28px 28px 24px', background: '#fff' }}>
              <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>Hi <strong>{account.tradingName}</strong>,</p>
              <p style={{ margin: '0 0 24px', lineHeight: 1.6, color: '#4b5563' }}>Thank you for your order. Here is your order confirmation and invoice details.</p>

              {/* Order info block */}
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Order confirmation</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <tbody>
                  {[
                    ['Order number', order.orderNumber],
                    ...(order.poReference ? [['PO reference', order.poReference]] : []),
                    ['Invoice number', invoiceNo],
                    ['Expected delivery', deliveryStr],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '3px 0', color: '#6b7280', width: '140px' }}>{k}</td>
                      <td style={{ padding: '3px 0', fontWeight: 600, color: '#111827', fontFamily: k === 'Order number' || k === 'Invoice number' || k === 'PO reference' ? 'monospace' : 'inherit' }}>{v}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>

              {/* Order lines */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Order summary</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {['Product', 'Code', 'Volume', 'Total'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: i > 0 ? 'right' : 'left', fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.map((l, i) => {
                      const vol = l.volumeLitres ?? 5
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 10px', fontWeight: 500, color: '#111827' }}>{l.productName}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{l.productCode}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: '#374151' }}>{l.quantity} × {vol}L</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>£{l.lineTotal.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td colSpan={3} style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>Subtotal (ex-VAT)</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>£{order.subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} style={{ padding: '4px 10px', textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>VAT (20%)</td>
                      <td style={{ padding: '4px 10px', textAlign: 'right', color: '#374151' }}>£{order.vatAmount.toFixed(2)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #111827' }}>
                      <td colSpan={3} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>Total</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: '15px', color: '#111827' }}>£{order.total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment details */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Payment details</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <tbody>
                  {[
                    ['Amount due',     `£${order.total.toFixed(2)}`],
                    ['Payment terms',  terms],
                    ['Due date',       dueStr],
                    ...(hasBankDetails ? [
                      ['Account name',   settings.bankAccountName],
                      ['Sort code',      settings.bankSortCode],
                      ['Account number', settings.bankAccountNumber],
                      ['Reference',      invoiceNo],
                    ] : [['Reference', invoiceNo]]),
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '3px 0', color: '#92400e', width: '140px', opacity: 0.7 }}>{k}</td>
                      <td style={{ padding: '3px 0', fontWeight: k === 'Amount due' || k === 'Reference' ? 700 : 500, color: '#78350f', fontFamily: k === 'Reference' || k === 'Sort code' || k === 'Account number' ? 'monospace' : 'inherit' }}>{v}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>

              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                {settings.bankReference || 'Please quote the invoice number as your payment reference.'}
              </p>
              <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#4b5563', lineHeight: 1.6 }}>If you have any questions, please don't hesitate to reach out.</p>
              <p style={{ margin: '20px 0 0', fontSize: '13px', color: '#4b5563', lineHeight: 1.8 }}>
                Warm regards,<br/>
                <strong>{settings.supplierName}</strong>
                {settings.supplierPhone && <><br/>{settings.supplierPhone}</>}
                {settings.supplierEmail && <><br/>{settings.supplierEmail}</>}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', gap: '10px' }}>
          <button
            onClick={copy}
            style={{
              flex: 1, padding: '11px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
              border: `1px solid ${copied ? '#bbf7d0' : '#e5e7eb'}`,
              background: copied ? '#f0fdf4' : '#f9fafb',
              color: copied ? '#166534' : '#374151', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              transition: 'all 0.15s',
            }}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5 6.5-6.5" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Copy to clipboard
              </>
            )}
          </button>
          <a
            href={mailtoHref}
            style={{
              flex: 1, padding: '11px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
              border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              textDecoration: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 3.5h12l-6 4.5L1 3.5zM1 3.5v7a1 1 0 001 1h10a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Open in Mail
          </a>
        </div>
      </div>
    </div>
  )
}