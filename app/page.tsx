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
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const revenueMTD = orders
    .filter((o) => o.createdAt >= startOfMonth && o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0)

  const outstanding = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((sum, p) => sum + p.amount, 0)

  const ordersThisMonth = orders.filter(
    (o) => o.createdAt >= startOfMonth
  ).length

  const overdueCount = payments.filter((p) => p.status === 'overdue').length

  const recentOrders = orders.slice(0, 8)

  const overduePayments = payments
    .filter((p) => p.status === 'overdue')
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={format(now, 'MMMM yyyy')}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setHidden(h => !h)}
              title={hidden ? 'Show amounts' : 'Hide amounts'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                border: '1px solid #e5e7eb', background: '#fff',
                cursor: 'pointer', color: '#9ca3af', transition: 'color 0.15s',
              }}
            >
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M3 3l14 14M8.5 8.6A3 3 0 0011.4 11.5M6.5 6.6C4.8 7.7 3.5 9 2 10c2 2.7 5 5 8 5a8 8 0 003.5-.8M9 5.1A8 8 0 0118 10c-.7 1-1.6 1.9-2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <ellipse cx="10" cy="10" rx="8" ry="5" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              )}
            </button>
            <Link href="/orders/new">
              <Button size="sm">+ New order</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Revenue MTD"
          value={`£${revenueMTD.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="This month"
          hidden={hidden}
        />
        <StatCard
          label="Outstanding"
          value={`£${outstanding.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="Pending + overdue"
          highlight={outstanding > 0}
          hidden={hidden}
        />
        <StatCard
          label="Orders this month"
          value={String(ordersThisMonth)}
        />
        <StatCard
          label="Overdue invoices"
          value={String(overdueCount)}
          highlight={overdueCount > 0}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent orders</h3>
            <Link href="/orders" className="text-xs text-gray-400 hover:text-gray-700">
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No orders yet</p>
              <Link href="/orders/new">
                <Button variant="secondary" size="sm" className="mt-3">
                  Create first order
                </Button>
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50">
                  <th className="text-left px-5 py-2.5 font-medium">Order</th>
                  <th className="text-left px-5 py-2.5 font-medium">Account</th>
                  <th className="text-left px-5 py-2.5 font-medium">Status</th>
                  <th className="text-right px-5 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const badge = orderStatusBadge(order.status)
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="text-sm font-medium text-gray-900 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-gray-400">
                          {format(order.createdAt, 'd MMM')}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {order.accountName}
                      </td>
                      <td className="px-5 py-3">
                        <Badge label={badge.label} variant={badge.variant} />
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-medium text-gray-900">
                        <span style={hidden ? { filter: 'blur(6px)', userSelect: 'none', display: 'inline-block' } : {}}>
                          £{order.total.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Overdue payments</h3>
            <Link href="/payments" className="text-xs text-gray-400 hover:text-gray-700">
              View all
            </Link>
          </div>
          {overduePayments.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No overdue payments</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50">
                  <th className="text-left px-5 py-2.5 font-medium">Invoice</th>
                  <th className="text-left px-5 py-2.5 font-medium">Account</th>
                  <th className="text-left px-5 py-2.5 font-medium">Due</th>
                  <th className="text-right px-5 py-2.5 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {overduePayments.map((payment) => {
                  const badge = paymentStatusBadge(payment.status)
                  return (
                    <tr
                      key={payment.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {payment.invoiceNumber}
                        </p>
                        <Badge label={badge.label} variant={badge.variant} />
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {payment.accountName}
                      </td>
                      <td className="px-5 py-3 text-sm text-red-600 font-medium">
                        {format(payment.dueDate, 'd MMM yyyy')}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-semibold text-red-700">
                        £{payment.amount.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}