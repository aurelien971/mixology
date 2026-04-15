'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
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
import { getPricingForAccount } from '@/lib/firestore/catalog'
import { Account, Order, Payment, AccountPricing, PAYMENT_TERMS_LABELS } from '@/types'
import toast from 'react-hot-toast'

type Tab = 'orders' | 'payments' | 'pricing'

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [pricingCount, setPricingCount] = useState(0)
  const [tab, setTab] = useState<Tab>('orders')
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
      const [acc, ords, pays, price] = await Promise.all([
        getAccount(id),
        getOrdersByAccount(id),
        getPaymentsByAccount(id),
        getPricingForAccount(id),
      ])
      setAccount(acc)
      setOrders(ords)
      setPayments(pays)
      setPricing(price)
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
    { key: 'orders', label: 'Orders', count: orders.length },
    { key: 'payments', label: 'Payments', count: payments.length },
    { key: 'pricing', label: 'Pricing', count: pricingCount },
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