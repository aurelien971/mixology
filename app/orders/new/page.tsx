'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getAccounts, createAccount } from '@/lib/firestore/accounts'
import { getPricingForAccount } from '@/lib/firestore/catalog'
import { createOrder, generateOrderNumber } from '@/lib/firestore/orders'
import { createPayment } from '@/lib/firestore/payments'
import { Account, AccountPricing, OrderLineItem, PAYMENT_TERMS_DAYS, BAEK_PRICE_PER_CASE, BAEK_BOTTLES_PER_CASE, BaekFlavour } from '@/types'
import { addDays } from 'date-fns'
import toast from 'react-hot-toast'

const VAT_RATE = 0.20
const BAEK_FLAVOURS: { key: BaekFlavour; label: string; code: string }[] = [
  { key: 'intricate', label: 'Intricate', code: 'BAEK-INT' },
  { key: 'mellow',    label: 'Mellow',    code: 'BAEK-MEL' },
  { key: 'variety',   label: 'Variety (Mix)', code: 'BAEK-VAR' },
]

type BusinessLine = 'cocktail' | 'baek'

export default function NewOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedAccountId = searchParams.get('accountId') ?? ''
  const [businessLine, setBusinessLine] = useState<BusinessLine>('cocktail')

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
        volumeLitres: p.volumeLitres ?? 5,
        quantity:     1,
        unitPrice:    p.pricePerUnit,
        lineTotal:    p.pricePerUnit,
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
        category:    'cocktail_production',
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
      <Header title="New order" subtitle="Select a business line to get started" />

      <div className="max-w-3xl space-y-6">

        {/* Business line selector */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Business line</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {([
              { key: 'cocktail', label: 'Cocktail Production', emoji: '🍹' },
              { key: 'baek',     label: 'BAEK',                emoji: '🍷' },
            ] as { key: BusinessLine; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => setBusinessLine(key)}
                style={{
                  flex: 1, padding: '14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left' as const,
                  border: `2px solid ${businessLine === key ? '#111827' : '#e5e7eb'}`,
                  background: businessLine === key ? '#111827' : '#fff',
                  color: businessLine === key ? '#fff' : '#374151',
                  transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{emoji}</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* BAEK order form */}
        {businessLine === 'baek' && (
          <BaekOrderForm onCreated={(id) => router.push(`/orders/${id}`)} accounts={accounts.filter(a => a.businessLine === 'baek')} />
        )}

        {/* Cocktail order form */}
        {businessLine === 'cocktail' && (<>

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

        </>)} {/* end cocktail conditional */}
      </div>
    </div>
  )
}

// ── BAEK Order Form ──────────────────────────────────────────────────────────

function BaekOrderForm({ onCreated, accounts: baekAccounts }: { onCreated: (id: string) => void; accounts: Account[] }) {
  const [saving, setSaving] = useState(false)

  // Account — existing or new
  const [accountMode, setAccountMode] = useState<'existing' | 'new'>('new')
  const [selectedAccountId, setSelectedAccountId] = useState('')

  // New account fields
  const [clientName, setClientName]   = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')

  // Order fields
  const [flavour, setFlavour]         = useState<BaekFlavour>('intricate')
  const [cases, setCases]             = useState(1)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes]             = useState('')

  const subtotal = cases * BAEK_PRICE_PER_CASE
  const vatAmt   = Math.round(subtotal * 0.2 * 100) / 100
  const total    = Math.round((subtotal + vatAmt) * 100) / 100
  const bottles  = cases * BAEK_BOTTLES_PER_CASE

  const flavourDef = BAEK_FLAVOURS.find(f => f.key === flavour)!

  async function handleSubmit() {
    if (accountMode === 'existing' && !selectedAccountId) return toast.error('Select an account')
    if (accountMode === 'new' && !clientName.trim()) return toast.error('Enter client name')
    if (cases < 1) return toast.error('Enter at least 1 case')

    setSaving(true)
    try {
      // Create account if new
      let accountId   = selectedAccountId
      let accountName = ''

      if (accountMode === 'new') {
        const newAcc = await createAccount({
          tradingName:  clientName.trim(),
          legalName:    clientName.trim(),
          type:         'external',
          email:        clientEmail.trim(),
          phone:        clientPhone.trim() || undefined,
          businessLine: 'baek',
          paymentTerms: 'net_30',
          address:      { line1: '', city: '', postcode: '' },
        })
        accountId   = newAcc
        accountName = clientName.trim()
      } else {
        accountName = baekAccounts.find(a => a.id === selectedAccountId)?.tradingName ?? ''
      }

      const orderNumber   = await generateOrderNumber()
      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`

      const orderId = await createOrder({
        orderNumber,
        invoiceNumber,
        accountId,
        accountName,
        businessLine: 'baek',
        category:     'baek',
        status:       'received',
        lineItems: [{
          productId:    flavourDef.code,
          productCode:  flavourDef.code,
          productName:  `BAEK ${flavourDef.label}`,
          volumeLitres: 0,
          quantity:     cases,
          unitPrice:    BAEK_PRICE_PER_CASE,
          lineTotal:    subtotal,
          servingSizeG: 0,
        }],
        subtotal,
        vatRate:   0.2,
        vatAmount: vatAmt,
        total,
        notes:     notes.trim() || undefined,
        ...(deliveryDate ? { expectedDeliveryDate: new Date(deliveryDate) } : {}),
      })

      await createPayment({
        orderId,
        orderNumber,
        accountId,
        accountName,
        invoiceNumber,
        amount:  total,
        dueDate: addDays(new Date(), 30),
        status:  'pending',
      })

      toast.success(`BAEK order ${orderNumber} created`)
      onCreated(orderId)
    } catch (e) {
      console.error(e)
      toast.error('Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '6px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Account */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 14px' }}>Client</p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {(['new', 'existing'] as const).map(m => (
            <button key={m} onClick={() => setAccountMode(m)} style={{
              padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${accountMode === m ? '#111827' : '#e5e7eb'}`,
              background: accountMode === m ? '#111827' : '#fff',
              color: accountMode === m ? '#fff' : '#6b7280',
            }}>{m === 'new' ? 'New client' : 'Existing client'}</button>
          ))}
        </div>

        {accountMode === 'new' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Client / company name *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. The Ivy" style={inp} />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="orders@example.com" style={inp} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+44..." style={inp} />
            </div>
          </div>
        ) : (
          <div>
            <label style={lbl}>Select client</label>
            <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">Select...</option>
              {baekAccounts.map(a => <option key={a.id} value={a.id}>{a.tradingName}</option>)}
            </select>
            {baekAccounts.length === 0 && <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>No BAEK clients yet — switch to "New client"</p>}
          </div>
        )}
      </div>

      {/* Flavour + Quantity */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 14px' }}>Order</p>

        <div style={{ marginBottom: '16px' }}>
          <label style={lbl}>Flavour *</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {BAEK_FLAVOURS.map(f => (
              <button key={f.key} onClick={() => setFlavour(f.key)} style={{
                flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' as const,
                border: `2px solid ${flavour === f.key ? '#111827' : '#e5e7eb'}`,
                background: flavour === f.key ? '#111827' : '#fff',
                color: flavour === f.key ? '#fff' : '#374151',
                fontSize: '13px', fontWeight: 600,
              }}>{f.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={lbl}>Cases *</label>
            <input
              type="number" min="1" value={cases}
              onChange={e => setCases(Math.max(1, parseInt(e.target.value) || 1))}
              style={inp}
            />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{bottles} bottles · £{BAEK_PRICE_PER_CASE}/case</p>
          </div>
          <div>
            <label style={lbl}>Requested delivery</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={inp} />
          </div>
        </div>

        <div>
          <label style={lbl}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Delivery instructions, special requests..." style={{ ...inp, resize: 'none' as const }} />
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
          <span style={{ color: '#6b7280' }}>{cases} case{cases !== 1 ? 's' : ''} × £{BAEK_PRICE_PER_CASE}</span>
          <span style={{ fontWeight: 600 }}>£{subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
          <span style={{ color: '#6b7280' }}>VAT (20%)</span>
          <span>£{vatAmt.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
          <span>Total</span>
          <span>£{total.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <Button variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
        <Button onClick={handleSubmit} loading={saving}>Create BAEK order</Button>
      </div>
    </div>
  )
}