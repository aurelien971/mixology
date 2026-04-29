'use client'

import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { getOrders } from '@/lib/firestore/orders'
import { getProducts } from '@/lib/firestore/catalog'
import { Order, Product } from '@/types'

function r2(n: number) { return Math.round(n * 100) / 100 }

interface LineBreakdown {
  productName: string
  productCode: string
  quantity: number
  volumeLitres: number
  totalLitres: number
  pricePerBag: number
  revenue: number
  costPerLitre: number
  cogs: number
  margin: number
  missing: boolean
}

interface OrderProfit {
  order: Order
  revenue: number
  cogs: number
  profit: number
  margin: number
  hasMissingCosts: boolean
  missingProducts: string[]
  lines: LineBreakdown[]
}

function calcOrderProfit(order: Order, productMap: Map<string, Product>): OrderProfit {
  const revenue = r2(order.subtotal)
  let cogs = 0
  let hasMissingCosts = false
  const missingProducts: string[] = []
  const lines: LineBreakdown[] = []

  for (const item of order.lineItems) {
    const product    = productMap.get(item.productId)
    const vol        = item.volumeLitres ?? product?.volumeLitres ?? 5
    const totalLitres = r2(item.quantity * vol)
    const lineRevenue = r2(item.lineTotal)

    if (!product || product.costMissing || product.costToMake === 0) {
      hasMissingCosts = true
      missingProducts.push(item.productName)
      lines.push({
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        volumeLitres: vol,
        totalLitres,
        pricePerBag: item.unitPrice,
        revenue: lineRevenue,
        costPerLitre: 0,
        cogs: 0,
        margin: 0,
        missing: true,
      })
      continue
    }

    // costToMake is per serving. Convert to per-litre then multiply by total litres.
    const costPerLitre = product.recommendedServingG > 0
      ? r2((product.costToMake / product.recommendedServingG) * 1000)
      : 0
    const lineCogs = r2(costPerLitre * totalLitres)
    const lineMargin = lineRevenue > 0 ? r2(((lineRevenue - lineCogs) / lineRevenue) * 100) : 0

    cogs += lineCogs
    lines.push({
      productName: item.productName,
      productCode: item.productCode,
      quantity: item.quantity,
      volumeLitres: vol,
      totalLitres,
      pricePerBag: item.unitPrice,
      revenue: lineRevenue,
      costPerLitre,
      cogs: lineCogs,
      margin: lineMargin,
      missing: false,
    })
  }

  cogs = r2(cogs)
  const profit = hasMissingCosts ? 0 : r2(revenue - cogs)
  const margin = revenue > 0 && !hasMissingCosts ? r2((profit / revenue) * 100) : 0
  return { order, revenue, cogs, profit, margin, hasMissingCosts, missingProducts, lines }
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
  const [orders, setOrders]         = useState<Order[]>([])
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map())
  const [loading, setLoading]       = useState(true)
  const [groupBy, setGroupBy]       = useState<'account' | 'none'>('none')
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [modalOrder, setModalOrder] = useState<OrderProfit | null>(null)

  useEffect(() => {
    async function load() {
      const [ords, prods] = await Promise.all([getOrders(200), getProducts()])
      setOrders(ords.filter(o => o.status !== 'cancelled'))
      setProductMap(new Map(prods.map(p => [p.id, p])))
      setLoading(false)
    }
    load()
  }, [])

  const profits = orders.map(o => calcOrderProfit(o, productMap))

  const totalRevenue = r2(profits.reduce((s, p) => s + p.revenue, 0))
  const totalCogs    = r2(profits.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.cogs, 0))
  const totalProfit  = r2(profits.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.profit, 0))
  const avgMargin    = profits.filter(p => !p.hasMissingCosts).length > 0
    ? r2(profits.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.margin, 0) / profits.filter(p => !p.hasMissingCosts).length)
    : 0
  const missingCount = profits.filter(p => p.hasMissingCosts).length

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
        action={missingCount > 0 ? (
          <Link href="/catalog?missing=1" style={{ fontSize: '12px', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '6px 12px', textDecoration: 'none', fontWeight: 500 }}>
            ⚠ {missingCount} order{missingCount !== 1 ? 's' : ''} with missing costs — add them in catalog →
          </Link>
        ) : undefined}
      />

      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <>
          {modalOrder && (
            <FinanceModal profit={modalOrder} onClose={() => setModalOrder(null)} />
          )}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
            {statCard('Total revenue (ex-VAT)', `£${totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, `${profits.length} orders`)}
            {statCard('Total COGS', `£${totalCogs.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Production costs')}
            {statCard('Gross profit', `£${totalProfit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Revenue minus COGS')}
            {statCard('Avg margin', `${avgMargin.toFixed(1)}%`, 'Excl. orders with missing costs')}
            {missingCount > 0 && statCard('Missing costs', String(missingCount), 'orders affected', true)}
          </div>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[...byAccount.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ name, profits: ps }) => {
                const rev    = r2(ps.reduce((s, p) => s + p.revenue, 0))
                const profit = r2(ps.filter(p => !p.hasMissingCosts).reduce((s, p) => s + p.profit, 0))
                const missing = ps.some(p => p.hasMissingCosts)
                const margin = rev > 0 && !missing ? r2((profit / rev) * 100) : 0
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
                    <OrderRows profits={ps} expanded={expanded} setExpanded={setExpanded} onOpenModal={setModalOrder} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
              <OrderRows profits={profits} expanded={expanded} setExpanded={setExpanded} onOpenModal={setModalOrder} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OrderRows({ profits, expanded, setExpanded, onOpenModal }: {
  profits: OrderProfit[]
  expanded: string | null
  setExpanded: (id: string | null) => void
  onOpenModal: (p: OrderProfit) => void
}) {
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
        {profits.map(({ order, revenue, cogs, profit, margin, hasMissingCosts, missingProducts, lines }) => {
          const isOpen = expanded === order.id
          return (
            <React.Fragment key={order.id}>
              <tr
                key={order.id}
                style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer', background: isOpen ? '#fafafa' : '#fff' }}
                onClick={() => setExpanded(isOpen ? null : order.id)}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#9ca3af', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <button
                      onClick={e => { e.stopPropagation(); onOpenModal({ order, revenue, cogs, profit, margin, hasMissingCosts, missingProducts, lines }) }}
                      style={{ fontWeight: 600, color: '#111827', fontFamily: 'monospace', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                    >
                      {order.orderNumber}
                    </button>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{order.accountName}</td>
                <td style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '12px' }}>{format(order.createdAt, 'd MMM yyyy')}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>£{revenue.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>
                  {hasMissingCosts ? '—' : `£${cogs.toFixed(2)}`}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: hasMissingCosts ? '#9ca3af' : profit >= 0 ? '#166534' : '#dc2626' }}>
                  {hasMissingCosts ? '—' : `£${profit.toFixed(2)}`}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <MarginBadge margin={margin} missing={hasMissingCosts} />
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {hasMissingCosts && (
                    <span style={{ fontSize: '11px', color: '#92400e' }} title={`Missing: ${missingProducts.join(', ')}`}>
                      ⚠ {missingProducts.length} product{missingProducts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </td>
              </tr>

              {/* Breakdown rows */}
              {isOpen && (
                <tr key={`${order.id}-breakdown`} style={{ background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                  <td colSpan={8} style={{ padding: '0 0 4px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <th style={{ padding: '8px 16px 8px 44px', fontWeight: 500, textAlign: 'left' }}>Product</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Volume</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Qty</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Total L</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Revenue</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Cost / L</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>COGS</th>
                          <th style={{ padding: '8px 16px', fontWeight: 500, textAlign: 'right' }}>Margin</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 16px 9px 44px' }}>
                              <p style={{ margin: 0, fontWeight: 500, color: '#111827' }}>{l.productName}</p>
                              <p style={{ margin: '1px 0 0', fontFamily: 'monospace', color: '#9ca3af', fontSize: '11px' }}>{l.productCode}</p>
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                              <span style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px', fontWeight: 500 }}>{l.volumeLitres}L</span>
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: '#6b7280' }}>×{l.quantity}</td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{l.totalLitres}L</td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: '#374151' }}>£{l.revenue.toFixed(2)}</td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: l.missing ? '#9ca3af' : '#6b7280' }}>
                              {l.missing ? '—' : `£${l.costPerLitre.toFixed(2)}/L`}
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: l.missing ? '#9ca3af' : '#6b7280' }}>
                              {l.missing ? (
                                <Link href="/catalog?missing=1" style={{ color: '#92400e', fontSize: '11px', fontWeight: 600 }}>+ add cost</Link>
                              ) : `£${l.cogs.toFixed(2)}`}
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                              {!l.missing && <MarginBadge margin={l.margin} missing={false} />}
                            </td>
                            <td />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Finance breakdown modal ─────────────────────────────────────────────────

function FinanceModal({ profit, onClose }: { profit: OrderProfit; onClose: () => void }) {
  const { order, revenue, cogs, grossProfit: gp, margin, hasMissingCosts, lines } = {
    ...profit,
    grossProfit: profit.profit,
  }
  const totalLitres = lines.reduce((s, l) => s + l.totalLitres, 0)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '48px', paddingBottom: '40px', zIndex: 100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '960px', maxHeight: '88vh', overflow: 'auto', margin: '0 20px', border: '1px solid #e5e7eb' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{order.orderNumber}</h2>
              <Link href={`/orders/${order.id}`} style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none', borderBottom: '1px solid #e5e7eb' }}>View order →</Link>
            </div>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '4px 0 0' }}>{order.accountName} · {totalLitres}L total</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          {[
            { label: 'Revenue (ex-VAT)', value: `£${revenue.toFixed(2)}`, color: '#111827' },
            { label: 'Total COGS',       value: hasMissingCosts ? '?' : `£${cogs.toFixed(2)}`, color: '#6b7280' },
            { label: 'Gross profit',     value: hasMissingCosts ? '?' : `£${gp.toFixed(2)}`,  color: gp >= 0 ? '#166534' : '#dc2626' },
            { label: 'Margin',           value: hasMissingCosts ? '?' : `${margin.toFixed(1)}%`, color: margin >= 50 ? '#166534' : margin >= 30 ? '#d97706' : '#dc2626' },
          ].map(c => (
            <div key={c.label} style={{ textAlign: 'center', padding: '14px 8px', background: '#f9fafb', borderRadius: '10px' }}>
              <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px', fontWeight: 500 }}>{c.label}</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: c.color, margin: 0 }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Per-product breakdown */}
        <div style={{ padding: '0 0 8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {['Cocktail', 'Vol', 'Qty', 'Total L', 'Revenue', 'Cost/L', 'COGS', 'Profit', 'GP%'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', fontWeight: 500, textAlign: i >= 1 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const lineProfit = l.missing ? 0 : r2(l.revenue - l.cogs)
                return (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontWeight: 600, color: '#111827', margin: 0 }}>{l.productName}</p>
                      <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#9ca3af', margin: '2px 0 0' }}>{l.productCode}</p>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{ background: '#f3f4f6', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, fontSize: '12px' }}>{l.volumeLitres}L</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>×{l.quantity}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{l.totalLitres}L</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>£{l.revenue.toFixed(2)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>
                      {l.missing ? <span style={{ color: '#d97706' }}>missing</span> : `£${l.costPerLitre.toFixed(2)}`}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>
                      {l.missing
                        ? <Link href="/catalog?missing=1" style={{ color: '#d97706', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>+ add cost</Link>
                        : `£${l.cogs.toFixed(2)}`
                      }
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: l.missing ? '#9ca3af' : lineProfit >= 0 ? '#166534' : '#dc2626' }}>
                      {l.missing ? '—' : `£${lineProfit.toFixed(2)}`}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {!l.missing && <MarginBadge margin={l.margin} missing={false} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals footer */}
            <tfoot>
              <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>Total</td>
                <td colSpan={3} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>{totalLitres}L</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>£{revenue.toFixed(2)}</td>
                <td style={{ padding: '12px 16px' }}/>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>{hasMissingCosts ? '—' : `£${cogs.toFixed(2)}`}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: hasMissingCosts ? '#9ca3af' : gp >= 0 ? '#166534' : '#dc2626' }}>
                  {hasMissingCosts ? '—' : `£${gp.toFixed(2)}`}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {!hasMissingCosts && <MarginBadge margin={margin} missing={false} />}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}