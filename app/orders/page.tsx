'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Badge, { orderStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import NoryImportModal from '@/components/orders/NoryImportModal'
import { getAllOrders } from '@/lib/firestore/orders'
import { Order, OrderStatus, OrderCategory } from '@/types'
import { useTable, ColumnDef } from '@/hooks/useTable'

const COLUMNS: ColumnDef<Order>[] = [
  { key: 'no',       label: 'Order no.', width: 118, sortValue: (o) => o.orderNumber },
  { key: 'account',  label: 'Account',   width: 200, sortValue: (o) => o.accountName },
  { key: 'category', label: 'Category',  width: 132, sortValue: (o) => (o.category ? CATEGORY_LABELS[o.category]?.label : '') },
  { key: 'po',       label: 'PO ref',    width: 110, sortValue: (o) => o.poReference },
  { key: 'date',     label: 'Date',      width: 118, sortValue: (o) => o.createdAt, descFirst: true },
  { key: 'status',   label: 'Status',    width: 112, sortValue: (o) => o.status },
  { key: 'items',    label: 'Items',     width: 70,  align: 'right', sortValue: (o) => o.lineItems.length, descFirst: true },
  { key: 'total',    label: 'Total',     width: 100, align: 'right', sortValue: (o) => o.total, descFirst: true },
  { key: 'signed',   label: 'Signed DN', width: 92,  align: 'center', sortValue: (o) => (o.signedDeliveryNoteUrl ? 1 : 0), descFirst: true },
  { key: 'go',       label: '',          width: 74 },
]

const CATEGORY_LABELS: Record<OrderCategory, { label: string; color: string; bg: string }> = {
  cocktail_production: { label: 'Cocktail Prod.',  color: '#0369a1', bg: '#e0f2fe' },
  cocktail_rd:         { label: 'Cocktail R&D',    color: '#7e22ce', bg: '#f3e8ff' },
  wine_consulting:     { label: 'Wine Consulting', color: '#b45309', bg: '#fef3c7' },
  popsicles:           { label: 'Popsicles',       color: '#0f766e', bg: '#ccfbf1' },
  baek:                { label: 'BAEK',            color: '#92400e', bg: '#fef3c7' },
  other:               { label: 'Other',           color: '#6b7280', bg: '#f3f4f6' },
}

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
  const [typeFilter, setTypeFilter] = useState<'all' | 'order' | 'rd'>('all')
  const cols = useTable<Order>('orders', COLUMNS)

  function load() {
    getAllOrders().then(setOrders).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const rows = orders.filter((o) => {
    const matchStatus = filter === 'all' || o.status === filter
    const matchSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.accountName.toLowerCase().includes(search.toLowerCase()) ||
      (o.poReference ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || (typeFilter === 'rd' ? o.type === 'rd' : o.type !== 'rd')
    return matchStatus && matchSearch && matchType
  })
  const filtered = cols.sortRows(rows)

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
            <Link href="/orders/rd/new">
              <Button size="sm" variant="secondary">+ New R&D</Button>
            </Link>
            <Link href="/orders/new">
              <Button size="sm">+ New order</Button>
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
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
                filter === f.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-2 border-l border-gray-200 pl-3">
          {([['all', 'All types'], ['order', 'Orders'], ['rd', 'R&D']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTypeFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === v ? 'bg-purple-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <cols.ResetButton />
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
          <div className="hidden md:block bg-white rounded-xl border border-gray-100" style={{ overflowX: 'auto' }}>
            <table className="dt" style={{ minWidth: cols.minWidth }}>
              <cols.ColGroup />
              <cols.Head />
              <tbody>
                {filtered.map((order) => {
                  const badge = orderStatusBadge(order.status)
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/orders/${order.id}`}>
                      <td className="px-5 py-3.5">
                        <Link href={`/orders/${order.id}`} className="text-sm font-medium text-gray-900 hover:underline">{order.orderNumber}</Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {order.accountName}
                          {order.type === 'rd' && (
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', letterSpacing: '0.05em' }}>R&D</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {order.category && CATEGORY_LABELS[order.category] && (
                          <span style={{
                            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
                            background: CATEGORY_LABELS[order.category].bg,
                            color: CATEGORY_LABELS[order.category].color,
                          }}>
                            {CATEGORY_LABELS[order.category].label}
                          </span>
                        )}
                      </td>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af', alignItems: 'center' }}>
                      <span>{format(order.createdAt, 'd MMM yyyy')}{order.poReference ? ` · ${order.poReference}` : ''}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {order.category && CATEGORY_LABELS[order.category] && (
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '20px', background: CATEGORY_LABELS[order.category].bg, color: CATEGORY_LABELS[order.category].color }}>
                            {CATEGORY_LABELS[order.category].label}
                          </span>
                        )}
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