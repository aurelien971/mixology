'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, isWithinInterval, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, differenceInDays } from 'date-fns'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Badge, { orderStatusBadge } from '@/components/ui/Badge'
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

// Previous period (same length, immediately before)
function getPrevRange(range: Range): Range {
  const ms   = range.to.getTime() - range.from.getTime()
  return { from: new Date(range.from.getTime() - ms), to: new Date(range.from.getTime() - 1) }
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

const REPORT_RECIPIENTS = 'c@dreamlab.bm,jamescowen@dreamlab.bm,jesse@bloomin.co.uk,aurelien@foodlab.is,tom.wylde@foodlab.is'

export default function DashboardPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading]   = useState(true)
  const [hidden, setHidden]     = useState(true)
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [deliveredOnly, setDeliveredOnly] = useState(false)

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

  const range    = useMemo(() => getRange(rangeKey, customFrom, customTo), [rangeKey, customFrom, customTo])
  const allActive = orders.filter(o => o.status !== 'cancelled' && o.type !== 'rd')

  const rangeOrders = useMemo(() => {
    const base = deliveredOnly ? allActive.filter(o => o.status === 'delivered') : allActive
    if (!range) return base
    return base.filter(o => isWithinInterval(o.createdAt, { start: range.from, end: range.to }))
  }, [orders, range, deliveredOnly])

  const prevOrders = useMemo(() => {
    if (!range) return []
    const prev = getPrevRange(range)
    const base = deliveredOnly ? allActive.filter(o => o.status === 'delivered') : allActive
    return base.filter(o => isWithinInterval(o.createdAt, { start: prev.from, end: prev.to }))
  }, [orders, range, deliveredOnly])

  const revenue     = rangeOrders.reduce((s, o) => s + (o.subtotal ?? 0), 0)
  const prevRevenue = prevOrders.reduce((s, o) => s + (o.subtotal ?? 0), 0)
  const growth      = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null

  const paidOrderIds = new Set(payments.filter(p => p.status === 'paid').map(p => p.orderId))
  const outstanding  = allActive
    .filter(o => !paidOrderIds.has(o.id) && (o.subtotal ?? 0) > 0)
    .reduce((s, o) => s + (o.subtotal ?? 0), 0)

  const rangeLabel = range
    ? `${format(range.from, 'd MMM')} – ${format(range.to, 'd MMM yyyy')}`
    : 'All time'

  // ── Chart data ─────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (rangeOrders.length === 0) return []
    const from = range?.from ?? new Date(Math.min(...rangeOrders.map(o => o.createdAt.getTime())))
    const to   = range?.to   ?? new Date()
    const days = differenceInDays(to, from)

    if (days <= 31) {
      // Daily
      return eachDayOfInterval({ start: from, end: to }).map(day => {
        const dayOrders = rangeOrders.filter(o =>
          format(o.createdAt, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
        )
        return {
          label: format(day, 'd MMM'),
          revenue: Math.round(dayOrders.reduce((s, o) => s + (o.subtotal ?? 0), 0)),
        }
      })
    } else if (days <= 90) {
      // Weekly
      return eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 }).map(week => {
        const weekEnd = new Date(week); weekEnd.setDate(weekEnd.getDate() + 6)
        const weekOrders = rangeOrders.filter(o => o.createdAt >= week && o.createdAt <= weekEnd)
        return {
          label: format(week, 'd MMM'),
          revenue: Math.round(weekOrders.reduce((s, o) => s + (o.subtotal ?? 0), 0)),
        }
      })
    } else {
      // Monthly
      return eachMonthOfInterval({ start: from, end: to }).map(month => {
        const monthEnd = endOfMonth(month)
        const monthOrders = rangeOrders.filter(o => o.createdAt >= month && o.createdAt <= monthEnd)
        return {
          label: format(month, 'MMM yy'),
          revenue: Math.round(monthOrders.reduce((s, o) => s + (o.subtotal ?? 0), 0)),
        }
      })
    }
  }, [rangeOrders, range])

  function openWeeklyReport() {
    const now  = new Date()
    const from = new Date(now); from.setDate(from.getDate() - 7)
    const weekOrders   = allActive.filter(o => o.createdAt >= from)
    const weekRev      = weekOrders.reduce((s, o) => s + (o.subtotal ?? 0), 0)
    const weekRevInc   = weekOrders.reduce((s, o) => s + o.total, 0)
    const overdue      = payments.filter(p => p.status === 'overdue')
    const overdueTotal = overdue.reduce((s, p) => s + (p.amount / 1.2), 0)
    const clientMap    = new Map<string, number>()
    weekOrders.forEach(o => {
      const litres = o.lineItems.reduce((s, l) => s + l.quantity * (l.volumeLitres ?? 5), 0)
      if (litres > 0) clientMap.set(o.accountName, (clientMap.get(o.accountName) ?? 0) + litres)
    })
    const clients  = [...clientMap.entries()].sort((a, b) => b[1] - a[1])
    const fmt      = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    const from_    = format(from, 'd MMM')
    const to_      = format(now, 'd MMM yyyy')
    const lines    = [
      `Hi team,`,
      ``,
      `Production report — ${from_} to ${to_}`,
      ``,
      `Revenue:  ${fmt(weekRev)} ex. VAT  (${fmt(weekRevInc)} inc.)`,
      ``,
      `Litres by account:`,
      ...clients.map(([name, l]) => `  ${name}: ${l}L`),
      ...(overdueTotal > 0 ? [``, `Outstanding: ${fmt(overdueTotal)}`] : []),
      ``,
      `Foodlab Production Tracker`,
    ]
    const subject = encodeURIComponent(`Foodlab Weekly Report — ${from_} to ${to_}`)
    const body    = encodeURIComponent(lines.join('\n'))
    window.location.href = `mailto:${REPORT_RECIPIENTS}?subject=${subject}&body=${body}`
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '12rem' }}>
      <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
    </div>
  )

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

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
            <Button variant="secondary" size="sm" onClick={openWeeklyReport}>📧 Weekly report</Button>
            <Link href="/orders/new"><Button size="sm">+ New order</Button></Link>
          </div>
        }
      />

      {/* Range selector */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '12px 16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {PRESETS.map(({ key, label }) => (
            <button key={key} onClick={() => setRangeKey(key)} style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'all 0.1s',
              border: `1px solid ${rangeKey === key ? '#111827' : 'transparent'}`,
              background: rangeKey === key ? '#111827' : 'transparent',
              color: rangeKey === key ? '#fff' : '#6b7280',
            }}>{label}</button>
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
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Based on</span>
          {[{ v: false, l: 'All orders' }, { v: true, l: 'Delivered only' }].map(({ v, l }) => (
            <button key={l} onClick={() => setDeliveredOnly(v)} style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${deliveredOnly === v ? '#111827' : 'transparent'}`,
              background: deliveredOnly === v ? '#111827' : 'transparent',
              color: deliveredOnly === v ? '#fff' : '#6b7280',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* 3 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>

        {/* Revenue */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '20px 22px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Revenue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
            <span style={hidden ? { filter: 'blur(8px)', userSelect: 'none' as const, display: 'inline-block' } : {}}>{fmt(revenue)}</span>
          </p>
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 8px' }}>
            ex. VAT · <span style={hidden ? { filter: 'blur(6px)', userSelect: 'none' as const, display: 'inline-block' } : {}}>{fmt(revenue * 1.2)} inc.</span>
          </p>
          {growth !== null && (
            <span style={{
              fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
              background: growth >= 0 ? '#f0fdf4' : '#fef2f2',
              color: growth >= 0 ? '#166534' : '#dc2626',
            }}>
              {growth >= 0 ? '↑' : '↓'} {Math.abs(growth).toFixed(1)}% vs prev. period
            </span>
          )}
        </div>

        {/* Outstanding */}
        <div style={{ background: outstanding > 0 ? '#fef2f2' : '#fff', borderRadius: '12px', border: `1px solid ${outstanding > 0 ? '#fecaca' : '#f3f4f6'}`, padding: '20px 22px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: outstanding > 0 ? '#dc2626' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Outstanding</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: outstanding > 0 ? '#dc2626' : '#111827', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
            <span style={hidden ? { filter: 'blur(8px)', userSelect: 'none' as const, display: 'inline-block' } : {}}>{fmt(outstanding)}</span>
          </p>
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>ex. VAT · unpaid invoices</p>
        </div>

        {/* Orders */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '20px 22px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Orders</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{rangeOrders.length}</p>
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            avg {fmt(rangeOrders.length > 0 ? revenue / rangeOrders.length : 0)} ex. VAT
          </p>
        </div>
      </div>

      {/* Revenue chart */}
      {chartData.length > 1 && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '20px 24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>Revenue (ex. VAT)</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{rangeLabel}</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#111827" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#111827" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v/1000).toFixed(0)}k`} width={40} />
              <Tooltip
                formatter={(v) => [`£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Revenue ex. VAT']}
                contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2} fill="url(#revGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent orders */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
            Orders <span style={{ fontWeight: 400, fontSize: '12px', color: '#9ca3af' }}>{rangeLabel}</span>
          </h3>
          <Link href="/orders" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>View all</Link>
        </div>
        {rangeOrders.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 12px' }}>No orders in this period</p>
            <Link href="/orders/new"><Button variant="secondary" size="sm">Create order</Button></Link>
          </div>
        ) : rangeOrders.slice(0, 8).map(order => {
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
                    <span style={hidden ? { filter: 'blur(5px)', userSelect: 'none' as const, display: 'inline-block' } : {}}>
                      {fmt(order.subtotal ?? 0)}
                    </span>
                  </p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{format(order.createdAt, 'd MMM')}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}