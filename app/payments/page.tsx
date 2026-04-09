'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Badge, { paymentStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getPayments, markPaymentPaid, updatePaymentStatus } from '@/lib/firestore/payments'
import { Payment, PaymentStatus } from '@/types'
import toast from 'react-hot-toast'

const STATUS_FILTERS: { label: string; value: PaymentStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
]

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('all')

  async function load() {
    setLoading(true)
    try {
      const data = await getPayments()
      setPayments(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleMarkPaid(id: string) {
    try {
      await markPaymentPaid(id)
      toast.success('Marked as paid')
      load()
    } catch {
      toast.error('Failed to update payment')
    }
  }

  const filtered =
    filter === 'all' ? payments : payments.filter((p) => p.status === filter)

  const totalOutstanding = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((s, p) => s + p.amount, 0)

  const totalOverdue = payments
    .filter((p) => p.status === 'overdue')
    .reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <Header
        title="Payments"
        subtitle="Invoice tracking and payment status"
      />

      <div className="flex gap-4 mb-6">
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outstanding</p>
          <p className="text-xl font-semibold text-gray-900">
            £{totalOutstanding.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4">
          <p className="text-xs text-red-400 uppercase tracking-wide mb-1">Overdue</p>
          <p className="text-xl font-semibold text-red-700">
            £{totalOverdue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-5">
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

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">No payments found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Invoice</th>
                <th className="text-left px-5 py-3 font-medium">Order</th>
                <th className="text-left px-5 py-3 font-medium">Account</th>
                <th className="text-left px-5 py-3 font-medium">Due date</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((payment) => {
                const badge = paymentStatusBadge(payment.status)
                const isOverdue = payment.status === 'overdue'
                return (
                  <tr
                    key={payment.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">
                      {payment.invoiceNumber}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {payment.orderNumber}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {payment.accountName}
                    </td>
                    <td className={`px-5 py-3.5 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {format(payment.dueDate, 'd MMM yyyy')}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge label={badge.label} variant={badge.variant} />
                    </td>
                    <td className={`px-5 py-3.5 text-sm text-right font-semibold ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>
                      £{payment.amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {payment.status !== 'paid' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMarkPaid(payment.id)}
                        >
                          Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}