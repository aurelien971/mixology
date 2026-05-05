'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import StatCard from '@/components/ui/StatCard'
import Badge, { orderStatusBadge, paymentStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getOrders } from '@/lib/firestore/orders'
import { getPayments } from '@/lib/firestore/payments'
import { Order, Payment } from '@/types'
import Link from 'next/link'

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [o, p] = await Promise.all([getOrders(20), getPayments()])
        setOrders(o)
        setPayments(p)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const revenueMTD   = orders.filter(o => o.createdAt >= startOfMonth && o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)
  const outstanding  = payments.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((s, p) => s + p.amount, 0)
  const ordersMonth  = orders.filter(o => o.createdAt >= startOfMonth).length
  const overdueCount = payments.filter(p => p.status === 'overdue').length
  const recentOrders = orders.slice(0, 8)
  const overduePayments = payments.filter(p => p.status === 'overdue').slice(0, 5)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '12rem' }}>
      <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
    </div>
  )

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={format(now, 'MMMM yyyy')}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setHidden(h => !h)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#9ca3af' }}
            >
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M8.5 8.6A3 3 0 0011.4 11.5M6.5 6.6C4.8 7.7 3.5 9 2 10c2 2.7 5 5 8 5a8 8 0 003.5-.8M9 5.1A8 8 0 0118 10c-.7 1-1.6 1.9-2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><ellipse cx="10" cy="10" rx="8" ry="5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
              )}
            </button>
            <Link href="/orders/new"><Button size="sm">+ New order</Button></Link>
          </div>
        }
      />

      {/* Stat cards — 2 col on mobile, 4 on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}
        className="md:grid-cols-4">
        <StatCard label="Revenue MTD" value={`£${revenueMTD.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`} sub="This month" hidden={hidden} />
        <StatCard label="Outstanding" value={`£${outstanding.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`} sub="Pending + overdue" highlight={outstanding > 0} hidden={hidden} />
        <StatCard label="Orders this month" value={String(ordersMonth)} />
        <StatCard label="Overdue invoices" value={String(overdueCount)} highlight={overdueCount > 0} />
      </div>

      {/* Two columns on desktop, stacked on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}
        className="md:grid-cols-2">

        {/* Recent orders */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Recent orders</h3>
            <Link href="/orders" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>View all</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>No orders yet</p>
              <Link href="/orders/new"><Button variant="secondary" size="sm">Create first order</Button></Link>
            </div>
          ) : (
            <div>
              {recentOrders.map(order => {
                const badge = orderStatusBadge(order.status)
                return (
                  <Link key={order.id} href={`/orders/${order.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{order.orderNumber}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{order.accountName}</p>
                          <Badge label={badge.label} variant={badge.variant} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>
                          <span style={hidden ? { filter: 'blur(5px)', userSelect: 'none', display: 'inline-block' } : {}}>
                            £{order.total.toFixed(2)}
                          </span>
                        </p>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{format(order.createdAt, 'd MMM')}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Overdue payments */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Overdue payments</h3>
            <Link href="/payments" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>View all</Link>
          </div>
          {overduePayments.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>No overdue payments 🎉</p>
            </div>
          ) : (
            <div>
              {overduePayments.map(payment => (
                <div key={payment.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{payment.invoiceNumber}</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{payment.accountName}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', margin: '0 0 2px' }}>£{payment.amount.toFixed(2)}</p>
                    <p style={{ fontSize: '11px', color: '#dc2626', margin: 0 }}>Due {format(payment.dueDate, 'd MMM')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}