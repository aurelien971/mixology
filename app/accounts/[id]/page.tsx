'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, isWithinInterval, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge, { orderStatusBadge, paymentStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import PricingManager from '@/components/accounts/PricingManager'
import DownloadPriceListButton from '@/components/accounts/DownloadPriceListButton'
import EditAccountModal from '@/components/accounts/EditAccountModal'
import { getAccount, deleteAccount } from '@/lib/firestore/accounts'
import { getOrdersByAccount } from '@/lib/firestore/orders'
import { getPaymentsByAccount } from '@/lib/firestore/payments'
import { getPricingForAccount, getProducts } from '@/lib/firestore/catalog'
import { Account, Order, Payment, AccountPricing, Product, PAYMENT_TERMS_LABELS } from '@/types'
import toast from 'react-hot-toast'

type Tab = 'orders' | 'payments' | 'pricing' | 'analytics'
type RangeKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | '3_months' | '6_months' | 'this_year' | 'all'

function getRange(key: RangeKey): { from: Date; to: Date } | null {
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
  }
}

const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'this_week',  label: 'This week' },
  { key: 'last_week',  label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: '3_months',   label: '3 months' },
  { key: '6_months',   label: '6 months' },
  { key: 'this_year',  label: 'This year' },
  { key: 'all',        label: 'All time' },
]

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pricingCount, setPricingCount] = useState(0)
  const [tab, setTab] = useState<Tab>('orders')
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [rangeKey, setRangeKey] = useState<RangeKey>('all')

  async function handleDelete() {
    if (!confirm(`Delete ${account?.tradingName}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteAccount(id)
      toast.success('Account deleted')
      router.push('/accounts')
    } catch {
      toast.error('Failed to delete')
      setDeleting(false)
    }
  }

  useEffect(() => {
    async function load() {
      const [acc, ords, pays, price, prods] = await Promise.all([
        getAccount(id),
        getOrdersByAccount(id),
        getPaymentsByAccount(id),
        getPricingForAccount(id),
        getProducts(),
      ])
      setAccount(acc)
      setOrders(ords)
      setPayments(pays)
      setPricing(price)
      setProducts(prods)
      setPricingCount(price.length)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <p className="text-sm text-gray-400 mt-8">Loading...</p>
  if (!account) return <p className="text-sm text-gray-400 mt-8">Account not found</p>

  const totalSpend = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.total, 0)

  const outstanding = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((s, p) => s + p.amount, 0)

  const paymentTermsLabel = account.paymentTerms
    ? PAYMENT_TERMS_LABELS[account.paymentTerms]
    : `${(account as any).paymentTermsDays ?? 30} days`

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'orders',    label: 'Orders',    count: orders.length },
    { key: 'payments',  label: 'Payments',  count: payments.length },
    { key: 'pricing',   label: 'Pricing',   count: pricingCount },
    { key: 'analytics', label: 'Analytics' },
  ]

  return (
    <div>
      {showEdit && (
        <EditAccountModal
          account={account}
          onClose={() => setShowEdit(false)}
          onSaved={async () => {
            const updated = await getAccount(id)
            if (updated) setAccount(updated)
          }}
        />
      )}
      <Header
        title={account.tradingName}
        subtitle={account.legalName}
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" onClick={() => setShowEdit(true)}>Edit account</Button>
            <Button size="sm" variant="secondary" onClick={handleDelete} loading={deleting}
              style={{ color: '#dc2626', borderColor: '#fecaca' }}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="flex gap-4 mb-6">
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total spend</p>
          <p className="text-xl font-semibold text-gray-900">
            £{totalSpend.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className={`border rounded-xl px-5 py-4 ${outstanding > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-xs uppercase tracking-wide mb-1 ${outstanding > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            Outstanding
          </p>
          <p className={`text-xl font-semibold ${outstanding > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            £{outstanding.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payment terms</p>
          <p className="text-sm font-semibold text-gray-900">{paymentTermsLabel}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Type</p>
          <Badge
            label={account.type === 'internal' ? 'Internal (CC)' : 'External'}
            variant={account.type === 'internal' ? 'purple' : 'blue'}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-3">
          <div className="flex gap-1 mb-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  tab === t.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-gray-100 text-gray-400'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'orders' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {orders.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-gray-400 mb-3">No orders yet</p>
                  <Link href="/orders/new">
                    <Button size="sm">Create order</Button>
                  </Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium">Order no.</th>
                      <th className="text-left px-5 py-3 font-medium">Date</th>
                      <th className="text-left px-5 py-3 font-medium">Status</th>
                      <th className="text-right px-5 py-3 font-medium">Total</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const b = orderStatusBadge(o.status)
                      return (
                        <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.orderNumber}</td>
                          <td className="px-5 py-3 text-sm text-gray-500">{format(o.createdAt, 'd MMM yyyy')}</td>
                          <td className="px-5 py-3"><Badge label={b.label} variant={b.variant} /></td>
                          <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">£{o.total.toFixed(2)}</td>
                          <td className="px-5 py-3 text-right">
                            <Link href={`/orders/${o.id}`}>
                              <Button variant="ghost" size="sm">View</Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {payments.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-gray-400">No payments recorded</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium">Invoice</th>
                      <th className="text-left px-5 py-3 font-medium">Due</th>
                      <th className="text-left px-5 py-3 font-medium">Status</th>
                      <th className="text-right px-5 py-3 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const b = paymentStatusBadge(p.status)
                      return (
                        <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.invoiceNumber}</td>
                          <td className={`px-5 py-3 text-sm ${p.status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {format(p.dueDate, 'd MMM yyyy')}
                          </td>
                          <td className="px-5 py-3"><Badge label={b.label} variant={b.variant} /></td>
                          <td className={`px-5 py-3 text-sm text-right font-semibold ${p.status === 'overdue' ? 'text-red-700' : 'text-gray-900'}`}>
                            £{p.amount.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'pricing' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <DownloadPriceListButton
                  mode="account"
                  account={{ tradingName: account.tradingName, legalName: account.legalName }}
                  pricing={pricing}
                />
              </div>
              <PricingManager
                accountId={id}
                accountName={account.tradingName}
                onPricingChange={setPricing}
              />
            </div>
          )}

          {tab === 'analytics' && (
            <AccountAnalytics
              orders={orders}
              pricing={pricing}
              products={products}
              rangeKey={rangeKey}
              setRangeKey={setRangeKey}
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
              Contact
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-400 text-xs">Email</dt>
                <dd className="text-gray-700 mt-0.5">{account.email}</dd>
              </div>
              {account.billingEmail && (
                <div>
                  <dt className="text-gray-400 text-xs">Billing email</dt>
                  <dd className="text-gray-700 mt-0.5">{account.billingEmail}</dd>
                </div>
              )}
              {account.phone && (
                <div>
                  <dt className="text-gray-400 text-xs">Phone</dt>
                  <dd className="text-gray-700 mt-0.5">{account.phone}</dd>
                </div>
              )}
              {account.vatNumber && (
                <div>
                  <dt className="text-gray-400 text-xs">VAT number</dt>
                  <dd className="text-gray-700 mt-0.5">{account.vatNumber}</dd>
                </div>
              )}
            </dl>
          </div>

          {account.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-medium text-amber-600 mb-1">Notes</p>
              <p className="text-sm text-amber-900">{account.notes}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
              Quick actions
            </h3>
            <div className="space-y-2">
              <Link href={`/orders/new?accountId=${id}`} className="block">
                <Button variant="secondary" size="sm" className="w-full justify-center">
                  + New order
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Analytics component ──────────────────────────────────────────────────────

function r2(n: number) { return Math.round(n * 100) / 100 }

function AccountAnalytics({
  orders, pricing, products, rangeKey, setRangeKey,
}: {
  orders: Order[]
  pricing: AccountPricing[]
  products: Product[]
  rangeKey: RangeKey
  setRangeKey: (k: RangeKey) => void
}) {
  const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.type !== 'rd')
  const range        = getRange(rangeKey)

  const rangeOrders = range
    ? activeOrders.filter(o => isWithinInterval(o.createdAt, { start: range.from, end: range.to }))
    : activeOrders

  // Build cost map from products
  const costMap = new Map<string, number>() // productId → costToMake per serving
  products.forEach(p => costMap.set(p.id, p.costToMake ?? 0))

  // Per-product stats
  type ProductStat = {
    productCode: string
    productName: string
    volumeLitres: number
    bags: number
    revenue: number
    cogs: number
  }

  const productMap = new Map<string, ProductStat>()

  rangeOrders.forEach(order => {
    order.lineItems.forEach(item => {
      const existing = productMap.get(item.productId) ?? {
        productCode:  item.productCode,
        productName:  item.productName,
        volumeLitres: 0,
        bags:         0,
        revenue:      0,
        cogs:         0,
      }
      const vol  = item.volumeLitres ?? 5
      const bags = item.quantity

      // COGS: find pricing entry for serving size
      const pricingEntry = pricing.find(p => p.productId === item.productId)
      const servingG     = pricingEntry?.recommendedServingG ?? 100
      const costPerServ  = costMap.get(item.productId) ?? 0
      const servingsPerBag = (vol * 1000) / servingG
      const cogsPerBag   = costPerServ * servingsPerBag
      const totalCogs    = cogsPerBag * bags

      productMap.set(item.productId, {
        ...existing,
        volumeLitres: existing.volumeLitres + bags * vol,
        bags:         existing.bags + bags,
        revenue:      r2(existing.revenue + item.lineTotal),
        cogs:         r2(existing.cogs + totalCogs),
      })
    })
  })

  const rows = [...productMap.values()].sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = r2(rows.reduce((s, r) => s + r.revenue, 0))
  const totalCogs    = r2(rows.reduce((s, r) => s + r.cogs, 0))
  const totalGP      = r2(totalRevenue - totalCogs)
  const totalGPPct   = totalRevenue > 0 ? r2((totalGP / totalRevenue) * 100) : 0
  const totalLitres  = rows.reduce((s, r) => s + r.volumeLitres, 0)
  const totalBags    = rows.reduce((s, r) => s + r.bags, 0)

  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

  const gpColor = (pct: number) =>
    pct >= 65 ? '#166534' : pct >= 50 ? '#92400e' : '#dc2626'
  const gpBg = (pct: number) =>
    pct >= 65 ? '#f0fdf4' : pct >= 50 ? '#fffbeb' : '#fef2f2'

  return (
    <div>
      {/* Range selector */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {RANGE_PRESETS.map(({ key, label }) => (
          <button key={key} onClick={() => setRangeKey(key)} style={{
            padding: '5px 13px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
            border: `1px solid ${rangeKey === key ? '#111827' : 'transparent'}`,
            background: rangeKey === key ? '#111827' : 'transparent',
            color: rangeKey === key ? '#fff' : '#6b7280',
          }}>{label}</button>
        ))}
      </div>

      {rangeOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '13px' }}>
          No orders in this period
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Revenue', value: fmt(totalRevenue), sub: 'ex. VAT' },
              { label: 'Gross profit', value: fmt(totalGP), sub: 'Revenue minus COGS', green: totalGP > 0 },
              { label: 'GP%', value: `${totalGPPct}%`, sub: totalCogs > 0 ? 'Based on cost data' : 'Missing cost data', green: totalGPPct > 0 },
              { label: 'Volume', value: `${totalLitres}L`, sub: `${totalBags} bags · ${rangeOrders.length} orders` },
            ].map(c => (
              <div key={c.label} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px' }}>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{c.label}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: c.green ? '#166534' : '#111827', margin: '0 0 2px', letterSpacing: '-0.3px' }}>{c.value}</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Per-product breakdown */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Product', 'Code', 'Bags', 'Volume', 'Revenue', 'GP%', 'GP £'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: i >= 2 ? 'right' : 'left', fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const gp    = r2(row.revenue - row.cogs)
                  const gpPct = row.revenue > 0 && row.cogs > 0 ? r2((gp / row.revenue) * 100) : null
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>{row.productName}</td>
                      <td style={{ padding: '10px 14px', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{row.productCode}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>{row.bags}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>{row.volumeLitres}L</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{fmt(row.revenue)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {gpPct !== null ? (
                          <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: gpBg(gpPct), color: gpColor(gpPct) }}>
                            {gpPct}%
                          </span>
                        ) : <span style={{ color: '#d1d5db', fontSize: '11px' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: gpPct !== null ? gpColor(gpPct) : '#9ca3af' }}>
                        {gpPct !== null ? fmt(gp) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, color: '#111827', fontSize: '12px' }}>Total</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{totalBags}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{totalLitres}L</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {totalGPPct > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: gpBg(totalGPPct), color: gpColor(totalGPPct) }}>
                        {totalGPPct}%
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: gpColor(totalGPPct) }}>{totalGP > 0 ? fmt(totalGP) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {totalCogs === 0 && (
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', textAlign: 'right' }}>
              GP figures require cost data in the catalog — <Link href="/catalog?missing=1" style={{ color: '#3b82f6' }}>fill missing costs</Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}