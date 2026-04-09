'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getAccounts } from '@/lib/firestore/accounts'
import { getPricingForAccount } from '@/lib/firestore/catalog'
import { createOrder, generateOrderNumber } from '@/lib/firestore/orders'
import { createPayment } from '@/lib/firestore/payments'
import { Account, AccountPricing, OrderLineItem } from '@/types'
import { addDays } from 'date-fns'
import toast from 'react-hot-toast'

const VAT_RATE = 0.20

export default function NewOrderPage() {
  const router = useRouter()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([])
  const [poReference, setPoReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingPricing, setLoadingPricing] = useState(false)

  useEffect(() => {
    getAccounts().then(setAccounts)
  }, [])

  useEffect(() => {
    if (!selectedAccountId) {
      setPricing([])
      setLineItems([])
      return
    }
    setLoadingPricing(true)
    getPricingForAccount(selectedAccountId)
      .then(setPricing)
      .finally(() => setLoadingPricing(false))
  }, [selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  function addLineItem(p: AccountPricing) {
    const exists = lineItems.find((l) => l.productId === p.productId)
    if (exists) return
    setLineItems((prev) => [
      ...prev,
      {
        productId: p.productId,
        productName: p.productName,
        quantity: 1,
        unitPrice: p.pricePerUnit,
        lineTotal: p.pricePerUnit,
        servingSizeG: 0,
      },
    ])
  }

  function updateQty(productId: string, qty: number) {
    if (qty < 1) return
    setLineItems((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, quantity: qty, lineTotal: qty * l.unitPrice }
          : l
      )
    )
  }

  function removeLineItem(productId: string) {
    setLineItems((prev) => prev.filter((l) => l.productId !== productId))
  }

  const subtotal = lineItems.reduce((s, l) => s + l.lineTotal, 0)
  const vatAmount = subtotal * VAT_RATE
  const total = subtotal + vatAmount

  async function handleSubmit() {
    if (!selectedAccount) return toast.error('Select an account')
    if (lineItems.length === 0) return toast.error('Add at least one item')

    setSaving(true)
    try {
      const orderNumber = await generateOrderNumber()
      const orderId = await createOrder({
        orderNumber,
        accountId: selectedAccount.id,
        accountName: selectedAccount.tradingName,
        status: 'received',
        lineItems,
        subtotal,
        vatRate: VAT_RATE,
        vatAmount,
        total,
        poReference: poReference || undefined,
        notes: notes || undefined,
      })

      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`
      const dueDate = addDays(new Date(), selectedAccount.paymentTermsDays)

      await createPayment({
        orderId,
        orderNumber,
        accountId: selectedAccount.id,
        accountName: selectedAccount.tradingName,
        invoiceNumber,
        amount: total,
        dueDate,
        status: 'pending',
      })

      toast.success(`Order ${orderNumber} created`)
      router.push(`/orders/${orderId}`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Header title="New order" subtitle="Create a manual order for an account" />

      <div className="max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Order details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Account *
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
              >
                <option value="">Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tradingName} — {a.legalName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                PO reference (optional)
              </label>
              <input
                type="text"
                value={poReference}
                onChange={(e) => setPoReference(e.target.value)}
                placeholder="e.g. PO-1234"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery instructions, special requests..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 resize-none"
              />
            </div>
          </div>
        </div>

        {selectedAccountId && (
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Add products</h3>
            {loadingPricing ? (
              <p className="text-sm text-gray-400">Loading pricing...</p>
            ) : pricing.length === 0 ? (
              <p className="text-sm text-gray-400">
                No pricing set up for this account yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {pricing.map((p) => {
                  const added = lineItems.some((l) => l.productId === p.productId)
                  return (
                    <button
                      key={p.productId}
                      onClick={() => addLineItem(p)}
                      disabled={added}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition-colors ${
                        added
                          ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-default'
                          : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-medium text-gray-800 truncate pr-2">
                        {p.productName}
                      </span>
                      <span className="text-gray-500 shrink-0">£{p.pricePerUnit.toFixed(2)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {lineItems.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Order lines</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-6 py-2.5 font-medium">Product</th>
                  <th className="text-right px-6 py-2.5 font-medium">Unit price</th>
                  <th className="text-right px-6 py-2.5 font-medium">Qty</th>
                  <th className="text-right px-6 py-2.5 font-medium">Total</th>
                  <th className="px-6 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {item.productName}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-gray-500">
                      £{item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateQty(item.productId, parseInt(e.target.value))}
                        className="w-16 px-2 py-1 text-sm text-right border border-gray-200 rounded-lg outline-none focus:border-gray-400"
                      />
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-semibold text-gray-900">
                      £{item.lineTotal.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => removeLineItem(item.productId)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-sm text-right space-y-1">
              <div className="flex justify-end gap-12 text-gray-500">
                <span>Subtotal</span>
                <span className="w-24">£{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-end gap-12 text-gray-500">
                <span>VAT (20%)</span>
                <span className="w-24">£{vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-end gap-12 font-semibold text-gray-900 pt-1 border-t border-gray-200">
                <span>Total</span>
                <span className="w-24">£{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={!selectedAccountId || lineItems.length === 0}
          >
            Create order
          </Button>
        </div>
      </div>
    </div>
  )
}