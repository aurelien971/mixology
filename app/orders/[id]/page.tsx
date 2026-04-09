'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Badge, { orderStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getOrder, updateOrderStatus } from '@/lib/firestore/orders'
import { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import Link from 'next/link'

const STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  received: 'picking',
  picking: 'dispatched',
  dispatched: 'delivered',
  delivered: null,
  cancelled: null,
}

const NEXT_LABEL: Record<OrderStatus, string> = {
  received: 'Start picking',
  picking: 'Mark dispatched',
  dispatched: 'Mark delivered',
  delivered: '',
  cancelled: '',
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  async function load() {
    try {
      const data = await getOrder(id)
      setOrder(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function advanceStatus() {
    if (!order) return
    const next = STATUS_FLOW[order.status]
    if (!next) return
    setUpdating(true)
    try {
      await updateOrderStatus(id, next, next === 'delivered' ? { deliveryDate: new Date() } : undefined)
      toast.success(`Order marked as ${next}`)
      load()
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  async function cancelOrder() {
    if (!order || !confirm('Cancel this order?')) return
    setUpdating(true)
    try {
      await updateOrderStatus(id, 'cancelled')
      toast.success('Order cancelled')
      load()
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8">Loading...</p>
  }

  if (!order) {
    return (
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-400">Order not found</p>
        <Link href="/orders">
          <Button variant="secondary" size="sm" className="mt-3">Back to orders</Button>
        </Link>
      </div>
    )
  }

  const badge = orderStatusBadge(order.status)
  const nextStatus = STATUS_FLOW[order.status]

  return (
    <div>
      <Header
        title={order.orderNumber}
        subtitle={`${order.accountName} · ${format(order.createdAt, 'd MMM yyyy')}`}
        action={
          <div className="flex gap-2">
            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={cancelOrder}
                loading={updating}
              >
                Cancel order
              </Button>
            )}
            {nextStatus && (
              <Button size="sm" onClick={advanceStatus} loading={updating}>
                {NEXT_LABEL[order.status]}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6 max-w-5xl">
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Order lines</h3>
              <span className="text-xs text-gray-400">{order.lineItems.length} items</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-5 py-2.5 font-medium">Product</th>
                  <th className="text-right px-5 py-2.5 font-medium">Unit price</th>
                  <th className="text-right px-5 py-2.5 font-medium">Qty</th>
                  <th className="text-right px-5 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lineItems.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-50">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">
                      {item.productName}
                    </td>
                    <td className="px-5 py-3 text-sm text-right text-gray-500">
                      £{item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-sm text-right text-gray-600">
                      {item.quantity}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">
                      £{item.lineTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 text-sm space-y-1">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>£{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>VAT (20%)</span>
                <span>£{order.vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200">
                <span>Total</span>
                <span>£{order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4">
              <p className="text-xs font-medium text-amber-600 mb-1">Notes</p>
              <p className="text-sm text-amber-900">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
              Order info
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Status</dt>
                <dd><Badge label={badge.label} variant={badge.variant} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Account</dt>
                <dd className="font-medium text-gray-900">{order.accountName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-700">{format(order.createdAt, 'd MMM yyyy')}</dd>
              </div>
              {order.deliveryDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Delivered</dt>
                  <dd className="text-gray-700">{format(order.deliveryDate, 'd MMM yyyy')}</dd>
                </div>
              )}
              {order.poReference && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">PO ref</dt>
                  <dd className="text-gray-700">{order.poReference}</dd>
                </div>
              )}
              {order.invoiceNumber && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Invoice</dt>
                  <dd className="text-gray-700">{order.invoiceNumber}</dd>
                </div>
              )}
              {order.deliveryNoteNumber && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Delivery note</dt>
                  <dd className="text-gray-700">{order.deliveryNoteNumber}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
              Documents
            </h3>
            <div className="space-y-2">
              {order.deliveryNoteUrl ? (
                <a href={order.deliveryNoteUrl} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm" className="w-full justify-center">
                    Download delivery note
                  </Button>
                </a>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  disabled={order.status === 'received' || order.status === 'cancelled'}
                >
                  Generate delivery note
                </Button>
              )}
              {order.invoiceUrl ? (
                <a href={order.invoiceUrl} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm" className="w-full justify-center">
                    Download invoice
                  </Button>
                </a>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  disabled={order.status !== 'delivered'}
                >
                  Generate invoice
                </Button>
              )}
            </div>
            {order.status === 'received' && (
              <p className="mt-3 text-xs text-gray-400">
                Documents available once order is picked
              </p>
            )}
          </div>

          <div className="text-center">
            <Link href="/orders" className="text-xs text-gray-400 hover:text-gray-700">
              ← Back to orders
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}