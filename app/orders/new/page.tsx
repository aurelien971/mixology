'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getAccounts } from '@/lib/firestore/accounts'
import { getPricingForAccount } from '@/lib/firestore/catalog'
import { createOrder, generateOrderNumber } from '@/lib/firestore/orders'
import { createPayment } from '@/lib/firestore/payments'
import { Account, AccountPricing, OrderLineItem, PAYMENT_TERMS_DAYS } from '@/types'
import { addDays } from 'date-fns'
import toast from 'react-hot-toast'

const VAT_RATE = 0.20

export default function NewOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedAccountId = searchParams.get('accountId') ?? ''

  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState(preselectedAccountId)
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
    if (!selectedAccountId) { setPricing([]); setLineItems([]); return }
    setLoadingPricing(true)
    getPricingForAccount(selectedAccountId)
      .then(setPricing)
      .finally(() => setLoadingPricing(false))
  }, [selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  function addLineItem(p: AccountPricing) {
    if (lineItems.find((l) => l.productId === p.productId)) return
    const ppl = p.pricePerLitre > 0
      ? p.pricePerLitre
      : p.recommendedServingG > 0
        ? Math.round((p.pricePerUnit / p.recommendedServingG) * 1000 * 100) / 100
        : p.pricePerUnit
    setLineItems((prev) => [
      ...prev,
      {
        productId:    p.productId,
        productCode:  p.productCode,
        productName:  p.productName,
        quantity:     1,           // litres
        unitPrice:    ppl,         // price per litre
        lineTotal:    ppl,
        servingSizeG: p.recommendedServingG,
      },
    ])
  }

  function updateQty(productId: string, qty: number) {
    const q = Math.max(0.5, qty)
    setLineItems((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, quantity: q, lineTotal: Math.round(q * l.unitPrice * 100) / 100 }
          : l
      )
    )
  }

  function removeLineItem(productId: string) {
    setLineItems((prev) => prev.filter((l) => l.productId !== productId))
  }

  const subtotal  = Math.round(lineItems.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100
  const total     = Math.round((subtotal + vatAmount) * 100) / 100

  async function handleSubmit() {
    if (!selectedAccount) return toast.error('Select an account')
    if (lineItems.length === 0) return toast.error('Add at least one item')

    setSaving(true)
    try {
      const orderNumber = await generateOrderNumber()

      const orderData: Parameters<typeof createOrder>[0] = {
        orderNumber,
        accountId:   selectedAccount.id,
        accountName: selectedAccount.tradingName,
        status:      'received',
        lineItems,
        subtotal,
        vatRate:    VAT_RATE,
        vatAmount,
        total,
      }
      if (poReference.trim()) orderData.poReference = poReference.trim()
      if (notes.trim())       orderData.notes       = notes.trim()

      const orderId = await createOrder(orderData)

      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`
      const termsDays = selectedAccount.paymentTerms
        ? PAYMENT_TERMS_DAYS[selectedAccount.paymentTerms]
        : 30

      await createPayment({
        orderId,
        orderNumber,
        accountId:   selectedAccount.id,
        accountName: selectedAccount.tradingName,
        invoiceNumber,
        amount:  total,
        dueDate: addDays(new Date(), termsDays),
        status:  'pending',
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
      <Header title="New order" subtitle="Wholesale — quantities in litres, prices per litre" />

      <div className="max-w-3xl space-y-6">

        {/* Order details */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Order details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Account *</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
              >
                <option value="">Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.tradingName} — {a.legalName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">PO reference (optional)</label>
              <input
                type="text"
                value={poReference}
                onChange={(e) => setPoReference(e.target.value)}
                placeholder="e.g. PO-1234"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
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

        {/* Product picker */}
        {selectedAccountId && (
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Add products</h3>
            <p className="text-xs text-gray-400 mb-4">Price shown per litre — adjust quantity in litres on the order line</p>
            {loadingPricing ? (
              <p className="text-sm text-gray-400">Loading pricing...</p>
            ) : pricing.length === 0 ? (
              <p className="text-sm text-gray-400">No pricing set up for this account yet. Go to the account page → Pricing tab.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {pricing.map((p) => {
                  const added = lineItems.some((l) => l.productId === p.productId)
                  const ppl = p.pricePerLitre > 0
                    ? p.pricePerLitre
                    : p.recommendedServingG > 0
                      ? Math.round((p.pricePerUnit / p.recommendedServingG) * 1000 * 100) / 100
                      : p.pricePerUnit
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
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{p.productName}</p>
                        <p className="text-xs text-gray-400">{p.productCode}</p>
                      </div>
                      <span className="text-gray-600 shrink-0 ml-2 font-medium">£{ppl.toFixed(2)}<span className="text-gray-400 font-normal">/L</span></span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Order lines */}
        {lineItems.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Order lines</h3>
              <span className="text-xs text-gray-400">All prices per litre · quantities in litres</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-6 py-2.5 font-medium">Product</th>
                  <th className="text-right px-6 py-2.5 font-medium">Price / L</th>
                  <th className="text-right px-6 py-2.5 font-medium">Litres</th>
                  <th className="text-right px-6 py-2.5 font-medium">Total</th>
                  <th className="px-6 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.productId} className="border-b border-gray-50">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                      <p className="text-xs text-gray-400">{item.productCode}</p>
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-gray-500">
                      £{item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={item.quantity}
                        onChange={(e) => updateQty(item.productId, parseFloat(e.target.value) || 0.5)}
                        className="w-20 px-2 py-1 text-sm text-right border border-gray-200 rounded-lg outline-none focus:border-gray-400"
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
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
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