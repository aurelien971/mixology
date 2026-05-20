'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, isWithinInterval, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import Header from '@/components/layout/Header'
import StatCard from '@/components/ui/StatCard'
import Badge, { orderStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getOrders } from '@/lib/firestore/orders'
import { getPayments } from '@/lib/firestore/payments'
import { Order, Payment } from '@/types'
import Link from 'next/link'

type RangeKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | '3_months' | '6_months' | 'this_year' | 'all' | 'custom'
interface Range { from: Date; to: Date }

function getRange(key: RangeKey, cf: string, ct: string): Range | null {
  const now = new Date()
  switch (key) {
    case 'this_week':  return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now }
    case 'last_week':  { const lw = subWeeks(now, 1); return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) } }
    case 'this_month': return { from: startOfMonth(now), to: now }
    case 'last_month': { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) } }
    case '3_months':   return { from: startOfMonth(subMonths(now, 2)), to: now }
    case '6_months':   return { from: startOfMonth(subMonths(now, 5)), to: now }
    case 'this_year':  return { from: startOfYear(now), to: now }
    case 'all':        return null
    case 'custom':     return cf && ct ? { from: new Date(cf), to: new Date(ct) } : null
    default:           return null
  }
}

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'this_week',  label: 'This week' },
  { key: 'last_week',  label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: '3_months',   label: '3 months' },
  { key: '6_months',   label: '6 months' },
  { key: 'this_year',  label: 'This year' },
  { key: 'all',        label: 'All time' },
  { key: 'custom',     label: '📅 Custom' },
]

export default function DashboardPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading]   = useState(true)
  const [hidden, setHidden]     = useState(true)
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [o, p] = await Promise.all([getOrders(500), getPayments()])
        setOrders(o); setPayments(p)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const range = useMemo(() => getRange(rangeKey, customFrom, customTo), [rangeKey, customFrom, customTo])
  const [deliveredOnly, setDeliveredOnly] = useState(false)

  const activeOrders = orders.filter(o => o.status !== 'cancelled')
  const rangeOrders  = useMemo(() => {
    const base = deliveredOnly ? activeOrders.filter(o => o.status === 'delivered') : activeOrders
    if (!range) return base
    return base.filter(o => isWithinInterval(o.createdAt, { start: range.from, end: range.to }))
  }, [orders, range, deliveredOnly])

  const revenue       = rangeOrders.reduce((s, o) => s + (o.subtotal ?? o.total / 1.2), 0)
  const revenueIncVat = rangeOrders.reduce((s, o) => s + o.total, 0)
  const litres        = rangeOrders.reduce((s, o) => s + o.lineItems.reduce((ls, l) => ls + l.quantity * (l.volumeLitres ?? 5), 0), 0)
  // Outstanding = sum of subtotals from active non-cancelled orders whose payment is pending/overdue
  const paidOrderIds  = new Set(payments.filter(p => p.status === 'paid').map(p => p.orderId))
  const outstanding   = activeOrders
    .filter(o => o.status !== 'cancelled' && !paidOrderIds.has(o.id) && o.subtotal > 0)
    .reduce((s, o) => s + (o.subtotal ?? 0), 0)
  const overdueCount  = payments.filter(p => p.status === 'overdue').length
  const activeClients = new Set(rangeOrders.map(o => o.accountId)).size
  const pendingOrders = orders.filter(o => o.status === 'received' || o.status === 'production').length
  const avgOrder      = rangeOrders.length > 0 ? revenue / rangeOrders.length : 0
  const recentOrders  = rangeOrders.slice(0, 8)
  const overduePayments = payments.filter(p => p.status === 'overdue').slice(0, 5)
  const rangeLabel    = range ? `${format(range.from, 'd MMM')} – ${format(range.to, 'd MMM yyyy')}` : 'All time'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '12rem' }}>
      <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
    </div>
  )

  const REPORT_RECIPIENTS = 'c@dreamlab.bm,jamescowen@dreamlab.bm,jesse@bloomin.co.uk,aurelien@foodlab.is,tom.wylde@foodlab.is'

  function openWeeklyReport() {
    const now  = new Date()
    const from = new Date(now); from.setDate(from.getDate() - 7)

    const weekOrders    = activeOrders.filter(o => o.createdAt >= from && o.type !== 'rd')
    const weekRev       = weekOrders.reduce((s, o) => s + o.total, 0)
    const weekRevExVat  = weekOrders.reduce((s, o) => s + o.subtotal, 0)
    const overdue       = payments.filter(p => p.status === 'overdue')
    const overdueTotal  = overdue.reduce((s, p) => s + p.amount, 0)

    // Per-client litres — only accounts with actual litres
    const clientMap = new Map<string, number>()
    weekOrders.forEach(o => {
      const litres = o.lineItems.reduce((s, l) => s + l.quantity * (l.volumeLitres ?? 5), 0)
      if (litres > 0) clientMap.set(o.accountName, (clientMap.get(o.accountName) ?? 0) + litres)
    })
    const clients = [...clientMap.entries()].sort((a, b) => b[1] - a[1])

    const fmt  = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    const from_ = format(from, 'd MMM')
    const to_   = format(now, 'd MMM yyyy')

    const lines = [
      `Hi team,`,
      ``,
      `Production report — ${from_} to ${to_}`,
      ``,
      `Revenue:  ${fmt(weekRev)} inc. VAT`,
      `Profit:   ${fmt(weekRevExVat)} ex. VAT`,
      ``,
      `Litres by account:`,
      ...clients.map(([name, l]) => `  ${name}: ${l}L`),
    ]

    if (overdueTotal > 0) {
      lines.push(``, `Outstanding: ${fmt(overdueTotal)}`)
    }

    lines.push(``, `Foodlab Production Tracker`)

    const subject = encodeURIComponent(`Foodlab Weekly Report — ${from_} to ${to_}`)
    const body    = encodeURIComponent(lines.join('\n'))
    window.location.href = `mailto:${REPORT_RECIPIENTS}?subject=${subject}&body=${body}`
  }

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={rangeLabel}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setHidden(h => !h)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#9ca3af' }}>
              {hidden
                ? <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M8.5 8.6A3 3 0 0011.4 11.5M6.5 6.6C4.8 7.7 3.5 9 2 10c2 2.7 5 5 8 5a8 8 0 003.5-.8M9 5.1A8 8 0 0118 10c-.7 1-1.6 1.9-2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                : <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><ellipse cx="10" cy="10" rx="8" ry="5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
              }
            </button>
            <Button variant="secondary" size="sm" onClick={openWeeklyReport}>
              📧 Weekly report
            </Button>
            <Link href="/orders/new"><Button size="sm">+ New order</Button></Link>
          </div>
        }
      />

      {/* ── Range selector ── */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '12px 16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRangeKey(key)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'all 0.1s',
                border: `1px solid ${rangeKey === key ? '#111827' : 'transparent'}`,
                background: rangeKey === key ? '#111827' : 'transparent',
                color: rangeKey === key ? '#fff' : '#6b7280',
              }}
            >{label}</button>
          ))}
        </div>

        {rangeKey === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
            {range && <span style={{ fontSize: '12px', color: '#9ca3af' }}>· {rangeOrders.length} orders</span>}
          </div>
        )}

        {/* Delivered vs all toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Revenue based on</span>
          {[
            { v: false, l: 'All orders' },
            { v: true,  l: 'Delivered only' },
          ].map(({ v, l }) => (
            <button key={l} onClick={() => setDeliveredOnly(v)} style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${deliveredOnly === v ? '#111827' : 'transparent'}`,
              background: deliveredOnly === v ? '#111827' : 'transparent',
              color: deliveredOnly === v ? '#fff' : '#6b7280',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Stats row 1 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '12px' }} className="md:grid-cols-4">
        <StatCard label={`Revenue${deliveredOnly ? ' (delivered)' : ''}`} value={`£${revenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`} sub={`ex. VAT · £${revenueIncVat.toLocaleString('en-GB', { minimumFractionDigits: 2 })} inc.`} hidden={hidden} />
        <StatCard label="Outstanding" value={`£${outstanding.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`} sub="Pending + overdue, ex. VAT" highlight={outstanding > 0} hidden={hidden} />
        <StatCard label="Litres produced" value={`${litres}L`} sub={rangeLabel} />
        <StatCard label="Clients" value={String(activeClients)} sub="In selected period" />
      </div>

      {/* ── Stats row 2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }} className="md:grid-cols-4">
        <StatCard label="Pending orders" value={String(pendingOrders)} sub="Received + in production" highlight={pendingOrders > 0} />
        <StatCard label="Overdue invoices" value={String(overdueCount)} highlight={overdueCount > 0} />
        <StatCard label="Avg order" value={`£${avgOrder.toFixed(0)}`} sub={rangeLabel} hidden={hidden} />
        <StatCard label="Total orders" value={String(rangeOrders.length)} sub={rangeLabel} />
      </div>

      {/* ── Lists ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }} className="md:grid-cols-2">

        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Orders <span style={{ fontWeight: 400, fontSize: '12px', color: '#9ca3af' }}>{rangeLabel}</span></h3>
            <Link href="/orders" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>View all</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 12px' }}>No orders in this period</p>
              <Link href="/orders/new"><Button variant="secondary" size="sm">Create order</Button></Link>
            </div>
          ) : recentOrders.map(order => {
            const badge = orderStatusBadge(order.status)
            return (
              <Link key={order.id} href={`/orders/${order.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>{order.orderNumber}</p>
                      {order.type === 'rd' && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce' }}>R&D</span>}
                      <Badge label={badge.label} variant={badge.variant} />
                    </div>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{order.accountName}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>
                      <span style={hidden ? { filter: 'blur(5px)', userSelect: 'none' as const, display: 'inline-block' } : {}}>£{order.total.toFixed(2)}</span>
                    </p>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{format(order.createdAt, 'd MMM')}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Overdue payments</h3>
            <Link href="/finances" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>View all</Link>
          </div>
          {overduePayments.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>No overdue payments 🎉</p>
            </div>
          ) : overduePayments.map(payment => (
            <div key={payment.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{payment.invoiceNumber}</p>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{payment.accountName}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', margin: '0 0 2px' }}>£{payment.amount.toFixed(2)}</p>
                <p style={{ fontSize: '11px', color: '#dc2626', margin: 0 }}>Due {format(payment.dueDate, 'd MMM')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}