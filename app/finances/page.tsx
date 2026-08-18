'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, subWeeks, isWithinInterval, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, differenceInCalendarDays } from 'date-fns'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { getOrders, getAllOrders } from '@/lib/firestore/orders'
import { getProducts } from '@/lib/firestore/catalog'
import { Order, Product } from '@/types'
import toast from 'react-hot-toast'

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
  const [hideRd, setHideRd]         = useState(false)

  // Date range — must be declared before comparative useMemo
  type RangeKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'past_30' | 'all' | 'custom'
  const [rangeKey, setRangeKey]     = useState<RangeKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  // ── Comparative — derived from selected range ────────────────────────────────
  const { currRange, prevRange, currLabel, prevLabel } = useMemo(() => {
    const now = new Date()
    switch (rangeKey) {
      case 'this_week': {
        const curr = { from: startOfWeek(now, { weekStartsOn: 1 }), to: now }
        const lw   = subWeeks(now, 1)
        const prev = { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) }
        return { currRange: curr, prevRange: prev, currLabel: 'This week', prevLabel: 'Last week' }
      }
      case 'last_week': {
        const lw   = subWeeks(now, 1)
        const curr = { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) }
        const lw2  = subWeeks(now, 2)
        const prev = { from: startOfWeek(lw2, { weekStartsOn: 1 }), to: endOfWeek(lw2, { weekStartsOn: 1 }) }
        return { currRange: curr, prevRange: prev, currLabel: 'Last week', prevLabel: 'Week before' }
      }
      case 'this_month': {
        const curr = { from: startOfMonth(now), to: now }
        const lm   = subMonths(now, 1)
        const prev = { from: startOfMonth(lm), to: endOfMonth(lm) }
        return { currRange: curr, prevRange: prev, currLabel: 'This month', prevLabel: format(lm, 'MMMM') }
      }
      case 'last_month': {
        const lm   = subMonths(now, 1)
        const curr = { from: startOfMonth(lm), to: endOfMonth(lm) }
        const lm2  = subMonths(now, 2)
        const prev = { from: startOfMonth(lm2), to: endOfMonth(lm2) }
        return { currRange: curr, prevRange: prev, currLabel: format(lm, 'MMMM'), prevLabel: format(lm2, 'MMMM') }
      }
      case 'past_30': {
        const curr = { from: new Date(now.getTime() - 30 * 86400000), to: now }
        const prev = { from: new Date(now.getTime() - 60 * 86400000), to: new Date(now.getTime() - 30 * 86400000 - 1) }
        return { currRange: curr, prevRange: prev, currLabel: 'Last 30 days', prevLabel: 'Prev. 30 days' }
      }
      case 'custom': {
        if (customFrom && customTo) {
          const curr = { from: new Date(customFrom), to: new Date(customTo) }
          const ms   = curr.to.getTime() - curr.from.getTime()
          const prev = { from: new Date(curr.from.getTime() - ms - 1), to: new Date(curr.from.getTime() - 1) }
          return { currRange: curr, prevRange: prev, currLabel: 'Selected period', prevLabel: 'Previous period' }
        }
        return { currRange: null, prevRange: null, currLabel: '', prevLabel: '' }
      }
      default:
        return { currRange: null, prevRange: null, currLabel: '', prevLabel: '' }
    }
  }, [rangeKey, customFrom, customTo])

  const accountComparison = useMemo(() => {
    if (!currRange || !prevRange) return []
    type Acc = { name: string; revenue: number; litres: number; orders: number; profit: number; hasCosts: boolean }
    const curr = new Map<string, Acc>()
    const prev = new Map<string, { revenue: number; litres: number; profit: number }>()
    const currOrders = orders.filter(o => isWithinInterval(o.createdAt, { start: currRange.from, end: currRange.to }) && (!hideRd || o.type !== 'rd'))
    const prevOrders = orders.filter(o => isWithinInterval(o.createdAt, { start: prevRange.from, end: prevRange.to }) && (!hideRd || o.type !== 'rd'))
    currOrders.forEach(o => {
      const p = calcOrderProfit(o, productMap)
      const key = o.accountName; const ex = curr.get(key) ?? { name: key, revenue: 0, litres: 0, orders: 0, profit: 0, hasCosts: true }
      const litres = o.lineItems.reduce((s, l) => s + l.quantity * (l.volumeLitres ?? 5), 0)
      curr.set(key, { ...ex, revenue: r2(ex.revenue + p.revenue), litres: ex.litres + litres, orders: ex.orders + 1, profit: r2(ex.profit + p.profit), hasCosts: ex.hasCosts && !p.hasMissingCosts })
    })
    prevOrders.forEach(o => {
      const p = calcOrderProfit(o, productMap); const key = o.accountName; const ex = prev.get(key) ?? { revenue: 0, litres: 0, profit: 0 }
      const litres = o.lineItems.reduce((s, l) => s + l.quantity * (l.volumeLitres ?? 5), 0)
      prev.set(key, { revenue: r2(ex.revenue + p.revenue), litres: ex.litres + litres, profit: r2(ex.profit + p.profit) })
    })
    prevOrders.forEach(o => { if (!curr.has(o.accountName)) curr.set(o.accountName, { name: o.accountName, revenue: 0, litres: 0, orders: 0, profit: 0, hasCosts: false }) })
    return [...curr.entries()].map(([, c]) => {
      const p = prev.get(c.name) ?? { revenue: 0, litres: 0, profit: 0 }
      const gp = c.revenue > 0 && c.hasCosts ? r2((c.profit / c.revenue) * 100) : null
      const prevGp = p.revenue > 0 ? r2((p.profit / p.revenue) * 100) : null
      const revDiff = p.revenue > 0 ? r2(((c.revenue - p.revenue) / p.revenue) * 100) : null
      const litresDiff = p.litres > 0 ? r2(((c.litres - p.litres) / p.litres) * 100) : null
      const profitDiff = p.profit > 0 ? r2(((c.profit - p.profit) / p.profit) * 100) : null
      const gpDiff = prevGp !== null && gp !== null ? r2(gp - prevGp) : null
      return { ...c, prevRevenue: p.revenue, prevLitres: p.litres, prevProfit: p.profit, gp, prevGp, revDiff, litresDiff, profitDiff, gpDiff }
    }).filter(a => a.revenue > 0 || a.prevRevenue > 0).sort((a, b) => b.revenue - a.revenue)
  }, [orders, productMap, currRange, prevRange, hideRd])

  function copyComparisonToClipboard() {
    const header = ['Client', 'Vol vs Prev', 'Rev vs Prev', 'Profit vs Prev', 'GP vs Prev'].join('\t')
    const rows = accountComparison.map(ac => [
      ac.name,
      ac.litresDiff !== null ? `${ac.litresDiff > 0 ? '+' : ''}${ac.litresDiff}%` : ac.litres > 0 ? 'New' : 'Lost',
      ac.revDiff    !== null ? `${ac.revDiff    > 0 ? '+' : ''}${ac.revDiff}%`    : ac.revenue > 0 ? 'New' : 'Lost',
      ac.profitDiff !== null ? `${ac.profitDiff > 0 ? '+' : ''}${ac.profitDiff}%` : 'TBC',
      ac.gpDiff     !== null ? `${ac.gpDiff     > 0 ? '+' : ''}${ac.gpDiff}%`     : 'TBC',
    ].join('\t'))
    navigator.clipboard.writeText([header, ...rows].join('\n'))
    toast.success('Copied — paste into your spreadsheet')
  }
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [modalOrder, setModalOrder] = useState<OrderProfit | null>(null)
  const [exporting, setExporting]   = useState(false)

  // Full historical export — every order ever, one row per line item, with revenue/COGS/profit
  async function exportAllOrders() {
    setExporting(true)
    try {
      const allOrders = await getAllOrders()
      const active = allOrders.filter(o => o.status !== 'cancelled')
      const esc = (v: string | number) => {
        const s = String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const header = [
        'Order number', 'Date', 'Account', 'Group', 'Type', 'Status', 'Source',
        'Product', 'Product code', 'Bag volume (L)', 'Qty', 'Total litres',
        'Unit price (ex-VAT)', 'Line revenue (ex-VAT)', 'Cost per litre', 'Line COGS', 'Line profit',
        'Order revenue (ex-VAT)', 'Order COGS', 'Order profit', 'Order margin %', 'Missing costs',
      ]
      const rows: string[] = [header.join(',')]
      for (const o of active) {
        const p = calcOrderProfit(o, productMap)
        for (const l of p.lines) {
          rows.push([
            esc(o.orderNumber),
            format(o.createdAt, 'yyyy-MM-dd'),
            esc(o.accountName),
            esc(o.groupName ?? ''),
            o.type === 'rd' ? 'R&D' : 'Order',
            esc(o.status),
            esc(o.source ?? 'internal'),
            esc(l.productName),
            esc(l.productCode),
            l.volumeLitres,
            l.quantity,
            l.totalLitres,
            l.pricePerBag,
            l.revenue,
            l.missing ? '' : l.costPerLitre,
            l.missing ? '' : l.cogs,
            l.missing ? '' : r2(l.revenue - l.cogs),
            p.revenue,
            p.hasMissingCosts ? '' : p.cogs,
            p.hasMissingCosts ? '' : p.profit,
            p.hasMissingCosts ? '' : p.margin,
            p.hasMissingCosts ? 'YES' : '',
          ].join(','))
        }
      }
      const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `foodlab-orders-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${active.length} orders (${rows.length - 1} lines)`)
    } catch (e) {
      console.error(e)
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const dateRange = useMemo(() => {
    const now = new Date()
    if (rangeKey === 'this_week')  return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }
    if (rangeKey === 'last_week')  { const lw = new Date(now); lw.setDate(lw.getDate() - 7); return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) } }
    if (rangeKey === 'this_month') return { from: startOfMonth(now), to: endOfMonth(now) }
    if (rangeKey === 'last_month') { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) } }
    if (rangeKey === 'past_30')   return { from: new Date(now.getTime() - 30 * 86400000), to: now }
    if (rangeKey === 'custom' && customFrom && customTo) return { from: new Date(customFrom), to: new Date(customTo) }
    return null // all time
  }, [rangeKey, customFrom, customTo])

  useEffect(() => {
    async function load() {
      const [ords, prods] = await Promise.all([getOrders(200), getProducts()])
      setOrders(ords.filter(o => o.status !== 'cancelled'))
      setProductMap(new Map(prods.map(p => [p.id, p])))
      setLoading(false)
    }
    load()
  }, [])

  const profits = useMemo(() => {
    const filtered = dateRange
      ? orders.filter(o => isWithinInterval(o.createdAt, { start: dateRange.from, end: dateRange.to }))
      : orders
    return filtered
      .filter(o => !hideRd || o.type !== 'rd')
      .map(o => calcOrderProfit(o, productMap))
  }, [orders, productMap, dateRange, hideRd])

  // Pie chart — revenue by account
  const PIE_COLORS = ['#111827','#2563eb','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c']
  const pieData = useMemo(() => {
    const map = new Map<string, number>()
    profits.forEach(p => {
      map.set(p.order.accountName, (map.get(p.order.accountName) ?? 0) + p.revenue)
    })
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: r2(value) }))
      .sort((a, b) => b.value - a.value)
  }, [profits])

  // Revenue over time — built from `profits`, so it follows the date range AND the Hide R&D toggle
  const revenueSeries = useMemo(() => {
    if (profits.length === 0) return { data: [] as { label: string; revenue: number }[], granularity: 'day' as 'day' | 'week' | 'month' }
    const times = profits.map(p => p.order.createdAt.getTime())
    const from = dateRange ? dateRange.from : new Date(Math.min(...times))
    const to   = dateRange ? dateRange.to   : new Date(Math.max(...times))
    const spanDays = differenceInCalendarDays(to, from) + 1
    const granularity: 'day' | 'week' | 'month' = spanDays <= 35 ? 'day' : spanDays <= 180 ? 'week' : 'month'
    const keyOf = (d: Date) =>
      granularity === 'day'  ? format(d, 'yyyy-MM-dd')
      : granularity === 'week' ? format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      : format(d, 'yyyy-MM')
    const buckets =
      granularity === 'day'  ? eachDayOfInterval({ start: from, end: to })
      : granularity === 'week' ? eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 })
      : eachMonthOfInterval({ start: from, end: to })
    const totals = new Map<string, number>(buckets.map(b => [keyOf(b), 0]))
    profits.forEach(p => {
      const k = keyOf(p.order.createdAt)
      if (totals.has(k)) totals.set(k, totals.get(k)! + p.revenue)
    })
    const data = buckets.map(b => ({
      label: granularity === 'month' ? format(b, 'MMM yy') : format(b, 'd MMM'),
      revenue: r2(totals.get(keyOf(b)) ?? 0),
    }))
    return { data, granularity }
  }, [profits, dateRange])

  // Per-drink margins — aggregated from order lines, lowest margin first
  const drinkMargins = useMemo(() => {
    type Agg = { name: string; code: string; litres: number; revenue: number; cogs: number; missing: boolean; orders: number }
    const map = new Map<string, Agg>()
    for (const p of profits) {
      for (const l of p.lines) {
        const ex = map.get(l.productCode) ?? { name: l.productName, code: l.productCode, litres: 0, revenue: 0, cogs: 0, missing: false, orders: 0 }
        ex.litres = r2(ex.litres + l.totalLitres)
        ex.revenue = r2(ex.revenue + l.revenue)
        ex.orders += 1
        if (l.missing) ex.missing = true
        else ex.cogs = r2(ex.cogs + l.cogs)
        map.set(l.productCode, ex)
      }
    }
    return [...map.values()]
      .map(d => ({ ...d, margin: !d.missing && d.revenue > 0 ? r2(((d.revenue - d.cogs) / d.revenue) * 100) : null }))
      .sort((a, b) => (a.margin ?? 999) - (b.margin ?? 999))
  }, [profits])

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
          {/* Date range picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {([
              { key: 'this_week',  label: 'This week' },
              { key: 'last_week',  label: 'Last week' },
              { key: 'this_month', label: 'This month' },
              { key: 'last_month', label: 'Last month' },
              { key: 'past_30',    label: 'Past 30 days' },
              { key: 'all',        label: 'All time' },
              { key: 'custom',     label: 'Custom' },
            ] as { key: RangeKey; label: string }[]).map(({ key, label }) => (
              <button key={key} onClick={() => setRangeKey(key)} style={{
                padding: '5px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${rangeKey === key ? '#111827' : '#e5e7eb'}`,
                background: rangeKey === key ? '#111827' : '#fff',
                color: rangeKey === key ? '#fff' : '#6b7280',
              }}>{label}</button>
            ))}
            {rangeKey === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '7px', border: '1px solid #e5e7eb', fontSize: '12px', outline: 'none' }} />
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '7px', border: '1px solid #e5e7eb', fontSize: '12px', outline: 'none' }} />
              </div>
            )}
            {dateRange && (
              <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '4px' }}>
                {format(dateRange.from, 'd MMM')} – {format(dateRange.to, 'd MMM yyyy')} · {profits.length} orders
              </span>
            )}
            <button onClick={() => setHideRd(h => !h)} style={{
              marginLeft: 'auto', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${hideRd ? '#7e22ce' : '#e5e7eb'}`,
              background: hideRd ? '#f3e8ff' : '#fff',
              color: hideRd ? '#7e22ce' : '#9ca3af',
            }}>
              {hideRd ? '✓ R&D hidden' : 'Hide R&D'}
            </button>
            <button onClick={exportAllOrders} disabled={exporting} style={{
              padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
              cursor: exporting ? 'wait' : 'pointer', border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 1v8m0 0L4 6m3 3l3-3M2 11v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {exporting ? 'Exporting…' : 'Export all orders (CSV)'}
            </button>
          </div>

          {/* Stats row + Pie — balanced grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', marginBottom: '24px', alignItems: 'start' }}>

            {/* Left: stat cards 2×2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Total revenue (ex-VAT)', value: `£${totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, sub: `${profits.length} order${profits.length !== 1 ? 's' : ''}` },
                { label: 'Total COGS', value: `£${totalCogs.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, sub: 'Production costs' },
                { label: 'Gross profit', value: `£${totalProfit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, sub: 'Revenue minus COGS', green: totalProfit > 0 },
                { label: 'Avg margin', value: `${avgMargin.toFixed(1)}%`, sub: 'Excl. missing costs', green: avgMargin > 50 },
              ].map(c => (
                <div key={c.label} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '18px 20px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>{c.label}</p>
                  <p style={{ fontSize: '24px', fontWeight: 700, color: c.green ? '#166534' : '#111827', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{c.value}</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{c.sub}</p>
                </div>
              ))}
              {missingCount > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '18px 20px', gridColumn: '1 / -1' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Missing costs</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: '#92400e', margin: '0 0 2px' }}>{missingCount}</p>
                  <Link href="/catalog?missing=1" style={{ fontSize: '12px', color: '#92400e', textDecoration: 'underline' }}>Fix in catalog →</Link>
                </div>
              )}
            </div>

            {/* Right: Pie chart */}
            {pieData.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>Revenue by account</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 16px' }}>{dateRange ? `${format(dateRange.from, 'd MMM')} – ${format(dateRange.to, 'd MMM')}` : 'All time'}</p>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `£${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
                        String(name),
                      ]}
                      contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '12px' }}>
                  {pieData.map((d, i) => {
                    const pct = totalRevenue > 0 ? ((d.value / totalRevenue) * 100).toFixed(1) : '0'
                    return (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#374151' }}>{d.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827', minWidth: '70px', textAlign: 'right' }}>£{d.value.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Revenue over time ───────────────────────────────────────── */}
          {revenueSeries.data.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Revenue over time</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>
                    {revenueSeries.granularity === 'day' ? 'Daily' : revenueSeries.granularity === 'week' ? 'Weekly' : 'Monthly'} revenue (ex-VAT)
                    {hideRd ? ' · R&D excluded' : ''}
                  </p>
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>
                  £{totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })} total
                </p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueSeries.data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) => `£${v >= 1000 ? `${r2(v / 1000)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(value) => [`£${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Revenue']}
                    contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    cursor={{ stroke: '#d1d5db', strokeDasharray: '3 3' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#revenueFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Drink margins ───────────────────────────────────────────── */}
          {drinkMargins.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Drink margins</p>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>Lowest margin first — where to raise prices or cut costs</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Drink', 'Lines', 'Litres', 'Revenue', 'COGS', 'Profit', 'Margin'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '9px 14px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drinkMargins.map(d => (
                    <tr key={d.code} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{d.name}</span>
                        <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{d.code}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>{d.orders}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151' }}>{d.litres}L</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>£{d.revenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>{d.missing ? '—' : `£${d.cogs.toFixed(2)}`}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: d.missing ? '#9ca3af' : '#166534' }}>{d.missing ? '—' : `£${r2(d.revenue - d.cogs).toFixed(2)}`}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <MarginBadge margin={d.margin ?? 0} missing={d.missing} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Account comparison ──────────────────────────────────────── */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Account performance</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {currLabel && prevLabel && <span style={{ fontSize: '12px', color: '#9ca3af' }}>{currLabel} vs {prevLabel}</span>}
                {accountComparison.length > 0 && (
                  <button onClick={copyComparisonToClipboard} style={{ padding: '4px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M5 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9M9 1h4m0 0v4m0-4L6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Copy
                  </button>
                )}
              </div>
            </div>
            {!currRange ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No comparison available for "All time" — select a time range above</div>
            ) : accountComparison.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No orders in this period</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Client', 'Orders', 'Volume', `vs ${prevLabel}`, 'Revenue', `vs ${prevLabel}`, 'Profit', `vs ${prevLabel}`, 'GP%', `vs ${prevLabel}`].map((h, i) => (
                      <th key={i} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '9px 10px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accountComparison.map(ac => {
                    const pill = (val: number | null) => val !== null ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: val >= 0 ? '#f0fdf4' : '#fef2f2', color: val >= 0 ? '#166534' : '#dc2626', whiteSpace: 'nowrap' as const }}>
                        {val >= 0 ? '↑' : '↓'} {Math.abs(val)}%
                      </span>
                    ) : ac.revenue > 0 ? <span style={{ fontSize: '11px', color: '#9ca3af' }}>New</span> : <span style={{ fontSize: '11px', color: '#dc2626' }}>Lost</span>
                    return (
                      <tr key={ac.name} style={{ borderTop: '1px solid #f9fafb' }}>
                        <td style={{ padding: '10px 10px', fontWeight: 600, color: ac.revenue === 0 ? '#9ca3af' : '#111827' }}>{ac.name}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#6b7280' }}>{ac.orders || '—'}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#374151' }}>{ac.litres > 0 ? `${ac.litres}L` : '—'}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>{pill(ac.litresDiff)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: ac.revenue === 0 ? '#9ca3af' : '#111827' }}>{ac.revenue > 0 ? `£${ac.revenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—'}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>{pill(ac.revDiff)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: ac.profit > 0 && ac.hasCosts ? '#166534' : '#9ca3af' }}>{ac.hasCosts && ac.profit !== 0 ? `£${ac.profit.toFixed(2)}` : <span style={{ fontSize: '11px', color: '#d1d5db' }}>TBC</span>}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>{ac.hasCosts ? pill(ac.profitDiff) : <span style={{ fontSize: '11px', color: '#d1d5db' }}>TBC</span>}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>{ac.gp !== null ? <span style={{ fontWeight: 600, color: ac.gp >= 60 ? '#166534' : ac.gp >= 45 ? '#92400e' : '#dc2626' }}>{ac.gp}%</span> : <span style={{ fontSize: '11px', color: '#d1d5db' }}>TBC</span>}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>{ac.gpDiff !== null ? <span style={{ fontSize: '11px', fontWeight: 700, color: ac.gpDiff >= 0 ? '#166534' : '#dc2626' }}>{ac.gpDiff >= 0 ? '+' : ''}{ac.gpDiff}%</span> : <span style={{ fontSize: '11px', color: '#d1d5db' }}>TBC</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Orders table ─────────────────────────────────────────────── */}
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