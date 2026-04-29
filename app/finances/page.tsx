'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { getOrders } from '@/lib/firestore/orders'
import { getProducts } from '@/lib/firestore/catalog'
import { Order, Product } from '@/types'

function r2(n: number) { return Math.round(n * 100) / 100 }

interface OrderProfit {
  order: Order
  revenue: number          // ex-VAT
  cogs: number             // total cost to make
  profit: number
  margin: number           // %
  hasMissingCosts: boolean
  missingProducts: string[]
}

function calcOrderProfit(order: Order, productMap: Map<string, Product>): OrderProfit {
  const revenue = r2(order.subtotal)  // already ex-VAT
  let cogs = 0
  let hasMissingCosts = false
  const missingProducts: string[] = []

  for (const item of order.lineItems) {
    const product = productMap.get(item.productId)
    if (!product || product.costMissing || product.costToMake === 0) {
      hasMissingCosts = true
      missingProducts.push(item.productName)
      continue
    }
    // quantity = number of bags, volumeLitres = size per bag
    // total litres in order = quantity × volumeLitres
    const volPerBag   = item.volumeLitres ?? product.volumeLitres ?? 1
    const totalLitres = item.quantity * volPerBag
    const servingsInOrder = totalLitres * (1000 / (product.recommendedServingG || 100))
    cogs += r2(servingsInOrder * product.costToMake)
  }

  cogs    = r2(cogs)
  const profit = hasMissingCosts ? 0 : r2(revenue - cogs)
  const margin = revenue > 0 && !hasMissingCosts ? r2((profit / revenue) * 100) : 0

  return { order, revenue, cogs, profit, margin, hasMissingCosts, missingProducts }
}

function MarginBadge({ margin, missing }: { margin: number; missing: boolean }) {
  if (missing) return (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
      ? missing costs
    </span>
  )
  const c = margin >= 50
    ? { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }
    : margin >= 30
    ? { bg: '#fefce8', text: '#854d0e', border: '#fde68a' }
    : { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {margin.toFixed(1)}%
    </span>
  )
}

export default function FinancesPage() {
  const [orders, setOrders]           = useState<Order[]>([])
  const [productMap, setProductMap]   = useState<Map<string, Product>>(new Map())
  const [loading, setLoading]         = useState(true)
  const [groupBy, setGroupBy]         = useState<'account' | 'none'>('none')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const [ords, prods] = await Promise.all([getOrders(200), getProducts()])
      setOrders(ords.filter(o => o.status !== 'cancelled'))
      const map = new Map(prods.map(p => [p.id, p]))
      setProductMap(map)
      setLoading(false)
    }
    load()
  }, [])

  const profits = orders.map(o => calcOrderProfit(o, productMap))

  // Summary stats
  const totalRevenue  = r2(profits.reduce((s, p) => s + p.revenue, 0))
  const totalCogs     = r2(profits.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.cogs, 0))
  const totalProfit   = r2(profits.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.profit, 0))
  const avgMargin     = profits.filter(p => !p.hasMissingCosts).length > 0
    ? r2(profits.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.margin, 0) / profits.filter(p => !p.hasMissingCosts).length)
    : 0
  const missingCount  = profits.filter(p => p.hasMissingCosts).length

  // Group by account
  const byAccount = new Map<string, { name: string; profits: OrderProfit[] }>()
  for (const p of profits) {
    const key = p.order.accountId
    if (!byAccount.has(key)) byAccount.set(key, { name: p.order.accountName, profits: [] })
    byAccount.get(key)!.profits.push(p)
  }

  const statCard = (label: string, value: string, sub?: string, warn?: boolean) => (
    <div style={{ background: warn ? '#fffbeb' : '#f9fafb', border: `1px solid ${warn ? '#fde68a' : '#f3f4f6'}`, borderRadius: '12px', padding: '16px 20px', minWidth: '130px' }}>
      <p style={{ fontSize: '11px', color: warn ? '#92400e' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: warn ? '#92400e' : '#111827', margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  )

  return (
    <div>
      <Header
        title="Finances"
        subtitle="Profit and margin across all orders"
        action={
          missingCount > 0 ? (
            <Link href="/catalog?missing=1" style={{ fontSize: '12px', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '6px 12px', textDecoration: 'none', fontWeight: 500 }}>
              ⚠ {missingCount} order{missingCount !== 1 ? 's' : ''} with missing costs — add them in catalog →
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
            {statCard('Total revenue (ex-VAT)', `£${totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, `${profits.length} orders`)}
            {statCard('Total COGS', `£${totalCogs.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Production costs')}
            {statCard('Gross profit', `£${totalProfit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Revenue minus COGS')}
            {statCard('Avg margin', `${avgMargin.toFixed(1)}%`, 'Excl. orders with missing costs')}
            {missingCount > 0 && statCard('Missing costs', String(missingCount), 'orders affected', true)}
          </div>

          {/* Group toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {(['none', 'account'] as const).map(v => (
              <button key={v} onClick={() => setGroupBy(v)} style={{
                padding: '5px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${groupBy === v ? '#111827' : '#e5e7eb'}`,
                background: groupBy === v ? '#111827' : '#fff',
                color: groupBy === v ? '#fff' : '#6b7280',
              }}>
                {v === 'none' ? 'All orders' : 'By account'}
              </button>
            ))}
          </div>

          {groupBy === 'account' ? (
            // Grouped view
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[...byAccount.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ name, profits: ps }) => {
                const rev     = r2(ps.reduce((s, p) => s + p.revenue, 0))
                const profit  = r2(ps.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.profit, 0))
                const margin  = rev > 0 && ps.some(p => !p.hasMissingCosts) ? r2((profit / rev) * 100) : 0
                const missing = ps.some(p => p.hasMissingCosts)
                return (
                  <div key={name} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{name}</p>
                        <MarginBadge margin={margin} missing={missing} />
                      </div>
                      <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
                        <span style={{ color: '#6b7280' }}>Revenue: <strong style={{ color: '#111827' }}>£{rev.toFixed(2)}</strong></span>
                        {!missing && <span style={{ color: '#6b7280' }}>Profit: <strong style={{ color: '#166534' }}>£{profit.toFixed(2)}</strong></span>}
                      </div>
                    </div>
                    <OrderRows profits={ps} />
                  </div>
                )
              })}
            </div>
          ) : (
            // Flat view
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
              <OrderRows profits={profits} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OrderRows({ profits }: { profits: OrderProfit[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ background: '#f9fafb', color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {['Order', 'Account', 'Date', 'Revenue (ex-VAT)', 'COGS', 'Gross profit', 'Margin', ''].map((h, i) => (
            <th key={h+i} style={{ padding: '9px 16px', fontWeight: 500, textAlign: i >= 3 && i <= 6 ? 'right' : 'left' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {profits.map(({ order, revenue, cogs, profit, margin, hasMissingCosts, missingProducts }) => (
          <tr key={order.id} style={{ borderTop: '1px solid #f3f4f6' }}>
            <td style={{ padding: '11px 16px' }}>
              <Link href={`/orders/${order.id}`} style={{ fontWeight: 600, color: '#111827', textDecoration: 'none', fontFamily: 'monospace', fontSize: '12px' }}>
                {order.orderNumber}
              </Link>
            </td>
            <td style={{ padding: '11px 16px', color: '#6b7280' }}>{order.accountName}</td>
            <td style={{ padding: '11px 16px', color: '#9ca3af', fontSize: '12px' }}>{format(order.createdAt, 'd MMM yyyy')}</td>
            <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>£{revenue.toFixed(2)}</td>
            <td style={{ padding: '11px 16px', textAlign: 'right', color: '#6b7280' }}>
              {hasMissingCosts ? '—' : `£${cogs.toFixed(2)}`}
            </td>
            <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 600, color: hasMissingCosts ? '#9ca3af' : '#166534' }}>
              {hasMissingCosts ? '—' : `£${profit.toFixed(2)}`}
            </td>
            <td style={{ padding: '11px 16px', textAlign: 'right' }}>
              <MarginBadge margin={margin} missing={hasMissingCosts} />
            </td>
            <td style={{ padding: '11px 16px' }}>
              {hasMissingCosts && (
                <span style={{ fontSize: '11px', color: '#92400e' }} title={`Missing: ${missingProducts.join(', ')}`}>
                  ⚠ {missingProducts.length} product{missingProducts.length !== 1 ? 's' : ''}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}