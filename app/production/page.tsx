'use client'

import { useEffect, useState } from 'react'
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns'
import Link from 'next/link'
import { getOrders } from '@/lib/firestore/orders'
import {
  collection, getDocs, setDoc, doc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Order } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dueLabel(date: Date) {
  if (isPast(date) && !isToday(date)) return { label: 'Overdue', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
  if (isToday(date))    return { label: 'Due today',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  if (isTomorrow(date)) return { label: 'Due tomorrow', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' }
  const days = differenceInDays(date, new Date())
  return { label: `In ${days} days`, color: '#6b7280', bg: '#f9fafb', border: '#f3f4f6' }
}

function statusLabel(status: string) {
  if (status === 'received')   return { label: 'To produce',    dot: '#3b82f6' }
  if (status === 'production') return { label: 'In production', dot: '#f59e0b' }
  return { label: status, dot: '#9ca3af' }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [checked, setChecked]   = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const [ords, snap] = await Promise.all([
        getOrders(100),
        getDocs(collection(db, 'productionChecks')),
      ])
      const active = ords
        .filter(o => o.status === 'received' || o.status === 'production')
        .sort((a, b) => {
          const da = a.expectedDeliveryDate ?? a.deliveryDate ?? a.createdAt
          const db_ = b.expectedDeliveryDate ?? b.deliveryDate ?? b.createdAt
          return da.getTime() - db_.getTime()
        })
      setOrders(active)
      const checks: Record<string, boolean> = {}
      snap.forEach(d => { checks[d.id] = true })
      setChecked(checks)
      setLoading(false)
    }
    load()
  }, [])

  async function toggleItem(key: string, value: boolean) {
    setChecked(prev => ({ ...prev, [key]: value }))
    if (value) {
      await setDoc(doc(db, 'productionChecks', key), { done: true, at: Timestamp.now() })
    } else {
      const { deleteDoc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'productionChecks', key))
    }
  }

  const totalLitres = (order: Order) =>
    order.lineItems.reduce((s, l) => s + (l.quantity * (l.volumeLitres ?? 5)), 0)

  const orderProgress = (order: Order) => {
    const items = order.lineItems
    const done  = items.filter(l => checked[`${order.id}__${l.productId}`]).length
    return { done, total: items.length }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading production queue...</p>
    </div>
  )

  if (orders.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
      <div style={{ fontSize: '48px' }}>✓</div>
      <p style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>All clear</p>
      <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>No orders waiting to be produced</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '680px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
          Production queue
        </h1>
        <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
          {orders.length} order{orders.length !== 1 ? 's' : ''} to produce
        </p>
      </div>

      {/* Order cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {orders.map(order => {
          const due      = order.expectedDeliveryDate ?? order.deliveryDate ?? order.createdAt
          const badge    = dueLabel(due)
          const status   = statusLabel(order.status)
          const litres   = totalLitres(order)
          const progress = orderProgress(order)
          const open     = expanded === order.id
          const allDone  = progress.done === progress.total

          return (
            <div key={order.id} style={{
              background: '#fff',
              border: `1px solid ${isPast(due) && !isToday(due) ? '#fecaca' : '#e5e7eb'}`,
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: open ? '0 4px 16px rgba(0,0,0,0.06)' : 'none',
              transition: 'box-shadow 0.2s',
            }}>

              {/* Card header — click to expand */}
              <button
                onClick={() => setExpanded(open ? null : order.id)}
                style={{
                  width: '100%', padding: '18px 20px', background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px',
                  textAlign: 'left',
                }}
              >
                {/* Progress ring */}
                <ProgressRing done={progress.done} total={progress.total} />

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{order.accountName}</span>
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#9ca3af' }}>{order.orderNumber}</span>
                    {allDone && (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                        Ready ✓
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                      {litres}L total · {order.lineItems.length} cocktail{order.lineItems.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.dot, display: 'inline-block' }}/>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                    {badge.label}
                  </span>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>{format(due, 'd MMM')}</span>
                </div>

                {/* Chevron */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#9ca3af' }}>
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Expanded checklist */}
              {open && (
                <div style={{ borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ padding: '6px 20px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {progress.done}/{progress.total} done
                    </span>
                    <Link href={`/orders/${order.id}`} style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}>
                      View full order →
                    </Link>
                  </div>

                  <div style={{ padding: '4px 12px 16px' }}>
                    {order.lineItems.map((item, i) => {
                      const key  = `${order.id}__${item.productId}`
                      const done = !!checked[key]
                      const vol  = item.volumeLitres ?? 5
                      const totalL = item.quantity * vol

                      return (
                        <button
                          key={key}
                          onClick={() => toggleItem(key, !done)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
                            padding: '12px 10px', borderRadius: '10px', border: 'none',
                            background: done ? '#f9fafb' : '#fff',
                            cursor: 'pointer', textAlign: 'left',
                            borderBottom: i < order.lineItems.length - 1 ? '1px solid #f9fafb' : 'none',
                          }}
                        >
                          {/* Checkbox */}
                          <div style={{
                            width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
                            border: `2px solid ${done ? '#111827' : '#d1d5db'}`,
                            background: done ? '#111827' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}>
                            {done && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>

                          {/* Cocktail info */}
                          <div style={{ flex: 1 }}>
                            <p style={{
                              fontSize: '14px', fontWeight: 600, margin: 0,
                              color: done ? '#9ca3af' : '#111827',
                              textDecoration: done ? 'line-through' : 'none',
                            }}>
                              {item.productName}
                            </p>
                            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>
                              {item.productCode}
                            </p>
                          </div>

                          {/* Volume pill */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: '15px', fontWeight: 700,
                              color: done ? '#9ca3af' : '#111827',
                            }}>
                              {totalL}L
                            </div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                              {item.quantity} × {vol}L
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Progress ring ─────────────────────────────────────────────────────────

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r   = 16
  const circ = 2 * Math.PI * r
  const pct  = total > 0 ? done / total : 0
  const dash = pct * circ

  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="#f3f4f6" strokeWidth="3"/>
      <circle
        cx="20" cy="20" r={r} fill="none"
        stroke={pct === 1 ? '#16a34a' : '#111827'}
        strokeWidth="3"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.3s' }}
      />
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill={pct === 1 ? '#16a34a' : '#374151'}>
        {done}/{total}
      </text>
    </svg>
  )
}