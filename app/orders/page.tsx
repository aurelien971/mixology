'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Badge, { orderStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import NoryImportModal from '@/components/orders/NoryImportModal'
import { getOrders } from '@/lib/firestore/orders'
import { Order, OrderStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Received', value: 'received' },
  { label: 'In Production', value: 'production' },
  { label: 'Dispatched', value: 'dispatched' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
]

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showNoryModal,  setShowNoryModal]  = useState(false)

  function load() {
    getOrders().then(setOrders).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = orders.filter((o) => {
    const matchStatus = filter === 'all' || o.status === filter
    const matchSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.accountName.toLowerCase().includes(search.toLowerCase()) ||
      (o.poReference ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div style={{ position: 'relative' }}>
      {showNoryModal && (
        <NoryImportModal
          onClose={() => setShowNoryModal(false)}
          onCreated={() => { setShowNoryModal(false); load() }}
        />
      )}
      <Header
        title="Orders"
        subtitle="All orders across accounts"
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" onClick={() => setShowNoryModal(true)}>
              ↑ Import Nory CSV
            </Button>
            <Link href="/orders/new">
              <Button size="sm">+ New order</Button>
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by order no., account or PO ref..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
        />
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">
            {search || filter !== 'all' ? 'No orders match your filters' : 'No orders yet'}
          </p>
          {!search && filter === 'all' && (
            <Link href="/orders/new">
              <Button size="sm">Create first order</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium">Order no.</th>
                  <th className="text-left px-5 py-3 font-medium">Account</th>
                  <th className="text-left px-5 py-3 font-medium">PO ref</th>
                  <th className="text-left px-5 py-3 font-medium">Date</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Items</th>
                  <th className="text-right px-5 py-3 font-medium">Total</th>
                  <th className="text-center px-5 py-3 font-medium">Signed DN</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const badge = orderStatusBadge(order.status)
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/orders/${order.id}`}>
                      <td className="px-5 py-3.5">
                        <Link href={`/orders/${order.id}`} className="text-sm font-medium text-gray-900 hover:underline">{order.orderNumber}</Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{order.accountName}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-400">{order.poReference ?? '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{format(order.createdAt, 'd MMM yyyy')}</td>
                      <td className="px-5 py-3.5"><Badge label={badge.label} variant={badge.variant} /></td>
                      <td className="px-5 py-3.5 text-sm text-right text-gray-500">{order.lineItems.length}</td>
                      <td className="px-5 py-3.5 text-sm text-right font-semibold text-gray-900">£{order.total.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-center">
                        {order.signedDeliveryNoteUrl ? <span style={{ color: '#16a34a', fontSize: '16px' }}>✓</span> : <span style={{ color: '#d1d5db', fontSize: '13px' }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/orders/${order.id}`}><Button variant="ghost" size="sm">View</Button></Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex md:hidden flex-col gap-2">
            {filtered.map((order) => {
              const badge = orderStatusBadge(order.status)
              return (
                <Link key={order.id} href={`/orders/${order.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 3px', fontFamily: 'monospace' }}>{order.orderNumber}</p>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{order.accountName}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>£{order.total.toFixed(2)}</p>
                        <Badge label={badge.label} variant={badge.variant} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af' }}>
                      <span>{format(order.createdAt, 'd MMM yyyy')}{order.poReference ? ` · ${order.poReference}` : ''}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {order.signedDeliveryNoteUrl && <span style={{ color: '#16a34a' }}>✓ Signed</span>}
                        <span>{order.lineItems.length} item{order.lineItems.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}