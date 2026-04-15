'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAccounts } from '@/lib/firestore/accounts'
import { getPricingForAccount } from '@/lib/firestore/catalog'
import { createOrder, generateOrderNumber } from '@/lib/firestore/orders'
import { createPayment } from '@/lib/firestore/payments'
import { Account, AccountPricing, OrderLineItem, PAYMENT_TERMS_DAYS } from '@/types'
import { addDays } from 'date-fns'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface ParsedOrderLine {
  productName: string
  quantity: number
  matchedProductId?: string
  matchedProductCode?: string
  matchedUnitPrice?: number
  status: 'matched' | 'unmatched' | 'ambiguous'
}

interface ParsedOrder {
  accountName: string
  poReference: string
  notes: string
  lineItems: ParsedOrderLine[]
}

interface Props {
  onClose: () => void
  onSaved?: () => void
}

const VAT_RATE = 0.20

export default function ParseOrderModal({ onClose, onSaved }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [rawInput, setRawInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedOrder | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { getAccounts().then(setAccounts) }, [])

  useEffect(() => {
    if (!selectedAccountId) { setPricing([]); return }
    getPricingForAccount(selectedAccountId).then(setPricing)
  }, [selectedAccountId])

  // When pricing loads, try to match line items
  useEffect(() => {
    if (!parsed || pricing.length === 0) return
    const matched = matchLineItems(parsed.lineItems, pricing)
    setParsed(p => p ? { ...p, lineItems: matched } : p)
  }, [pricing])

  function matchLineItems(lines: ParsedOrderLine[], pricingList: AccountPricing[]): ParsedOrderLine[] {
    return lines.map(line => {
      const nameLower = line.productName.toLowerCase().trim()

      // Exact match
      const exact = pricingList.find(p => p.productName.toLowerCase() === nameLower)
      if (exact) return {
        ...line,
        matchedProductId: exact.productId,
        matchedProductCode: exact.productCode,
        matchedUnitPrice: exact.pricePerUnit,
        status: 'matched',
      }

      // Partial match
      const partial = pricingList.filter(p =>
        p.productName.toLowerCase().includes(nameLower) ||
        nameLower.includes(p.productName.toLowerCase().split(' ')[0])
      )
      if (partial.length === 1) return {
        ...line,
        productName: partial[0].productName,
        matchedProductId: partial[0].productId,
        matchedProductCode: partial[0].productCode,
        matchedUnitPrice: partial[0].pricePerUnit,
        status: 'matched',
      }
      if (partial.length > 1) return { ...line, status: 'ambiguous' }

      return { ...line, status: 'unmatched' }
    })
  }

  async function handleParse() {
    if (!rawInput.trim()) return toast.error('Paste something first')
    setParsing(true)
    try {
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'order', input: rawInput }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const data = json.data
      const lines: ParsedOrderLine[] = (data.lineItems ?? []).map((l: any) => ({
        productName: l.productName,
        quantity: l.quantity,
        status: 'unmatched',
      }))

      const order: ParsedOrder = {
        accountName: data.accountName ?? '',
        poReference: data.poReference ?? '',
        notes: data.notes ?? '',
        lineItems: lines,
      }

      // Auto-select account if matched
      const matchedAccount = accounts.find(a =>
        a.tradingName.toLowerCase() === order.accountName.toLowerCase() ||
        a.legalName.toLowerCase().includes(order.accountName.toLowerCase())
      )
      if (matchedAccount) setSelectedAccountId(matchedAccount.id)

      setParsed(order)
      setStep('review')
    } catch (e: any) {
      toast.error(e.message ?? 'Parse failed')
    } finally {
      setParsing(false)
    }
  }

  function updateLine(index: number, field: keyof ParsedOrderLine, value: any) {
    if (!parsed) return
    const updated = parsed.lineItems.map((l, i) => {
      if (i !== index) return l
      const newLine = { ...l, [field]: value }
      if (field === 'matchedProductId') {
        const p = pricing.find(p => p.productId === value)
        if (p) {
          newLine.productName = p.productName
          newLine.matchedProductCode = p.productCode
          newLine.matchedUnitPrice = p.pricePerUnit
          newLine.status = 'matched'
        }
      }
      return newLine
    })
    setParsed({ ...parsed, lineItems: updated })
  }

  function removeLine(index: number) {
    if (!parsed) return
    setParsed({ ...parsed, lineItems: parsed.lineItems.filter((_, i) => i !== index) })
  }

  async function handleSave() {
    if (!parsed) return
    const account = accounts.find(a => a.id === selectedAccountId)
    if (!account) return toast.error('Select an account')

    const unmatched = parsed.lineItems.filter(l => l.status !== 'matched')
    if (unmatched.length > 0) {
      if (!confirm(`${unmatched.length} item(s) are unmatched and will be skipped. Continue?`)) return
    }

    const validLines = parsed.lineItems.filter(
      l => l.status === 'matched' && l.matchedProductId && l.matchedUnitPrice
    )
    if (validLines.length === 0) return toast.error('No matched products to order')

    setSaving(true)
    try {
      const orderNumber = await generateOrderNumber()

      const lineItems: OrderLineItem[] = validLines.map(l => ({
        productId: l.matchedProductId!,
        productCode: l.matchedProductCode!,
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: l.matchedUnitPrice!,
        lineTotal: l.quantity * l.matchedUnitPrice!,
        servingSizeG: 0,
      }))

      const subtotal = lineItems.reduce((s, l) => s + l.lineTotal, 0)
      const vatAmount = subtotal * VAT_RATE
      const total = subtotal + vatAmount

      const orderData: any = {
        orderNumber,
        accountId: account.id,
        accountName: account.tradingName,
        status: 'received',
        lineItems,
        subtotal,
        vatRate: VAT_RATE,
        vatAmount,
        total,
      }
      if (parsed.poReference.trim()) orderData.poReference = parsed.poReference.trim()
      if (parsed.notes.trim()) orderData.notes = parsed.notes.trim()

      const orderId = await createOrder(orderData)

      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`
      const termsDays = account.paymentTerms ? PAYMENT_TERMS_DAYS[account.paymentTerms] : 30

      await createPayment({
        orderId,
        orderNumber,
        accountId: account.id,
        accountName: account.tradingName,
        invoiceNumber,
        amount: total,
        dueDate: addDays(new Date(), termsDays),
        status: 'pending',
      })

      toast.success(`Order ${orderNumber} created`)
      onSaved?.()
      onClose()
      router.push(`/orders/${orderId}`)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  const matchedCount = parsed?.lineItems.filter(l => l.status === 'matched').length ?? 0
  const subtotal = parsed?.lineItems
    .filter(l => l.status === 'matched' && l.matchedUnitPrice)
    .reduce((s, l) => s + l.quantity * (l.matchedUnitPrice ?? 0), 0) ?? 0

  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '60px', paddingBottom: '40px', zIndex: 50,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '760px',
        maxHeight: '82vh', overflow: 'auto', margin: '0 20px',
        border: '1px solid #e5e7eb',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              {step === 'input' ? 'Parse order with AI' : 'Review order'}
            </h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0' }}>
              {step === 'input'
                ? 'Paste a Nory PO email, CSV, or describe the order'
                : `${matchedCount} of ${parsed?.lineItems.length ?? 0} items matched · £${(subtotal * 1.2).toFixed(2)} inc. VAT`}
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {step === 'input' && (
          <div style={{ padding: '20px 24px' }}>
            <textarea
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              placeholder={`Paste anything — examples:\n\nFrom: nory@pyro.com\nSubject: Purchase Order #1234\n\nPlease supply:\n- Spicy Margarita TMS x 10\n- Negroni TMS x 5\n- Espresso Martini TMS x 8\n\nOr paste CSV:\nproduct,qty\nAegeas G+T,12\nDaphne,6`}
              rows={12}
              style={{
                width: '100%', padding: '12px', border: '1px solid #e5e7eb',
                borderRadius: '10px', fontSize: '13px', fontFamily: 'monospace',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <Button onClick={handleParse} loading={parsing} disabled={!rawInput.trim()}>
                Parse with AI
              </Button>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {step === 'review' && parsed && (
          <div style={{ padding: '20px 24px' }}>
            {/* Account + meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>Account *</label>
                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${!selectedAccountId ? '#f87171' : '#e5e7eb'}`, borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}
                >
                  <option value="">Select account...</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.tradingName} — {a.legalName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px' }}>PO reference</label>
                <input
                  value={parsed.poReference}
                  onChange={e => setParsed({ ...parsed, poReference: e.target.value })}
                  placeholder="e.g. PO-1234"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Line items */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', fontSize: '11px', color: '#9ca3af' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500 }}>Product</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500 }}>Match</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>Unit price</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 500 }}>Total</th>
                    <th style={{ padding: '10px 14px' }} />
                  </tr>
                </thead>
                <tbody>
                  {parsed.lineItems.map((line, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f3f4f6', background: line.status === 'unmatched' ? '#fef2f2' : line.status === 'ambiguous' ? '#fefce8' : '#fff' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <p style={{ margin: 0, fontWeight: 500 }}>{line.productName}</p>
                        {line.matchedProductCode && (
                          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{line.matchedProductCode}</p>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {line.status === 'matched' ? (
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Matched</span>
                        ) : line.status === 'ambiguous' ? (
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#fefce8', color: '#854d0e', border: '1px solid #fde68a' }}>Ambiguous</span>
                        ) : (
                          <select
                            value={line.matchedProductId ?? ''}
                            onChange={e => updateLine(i, 'matchedProductId', e.target.value)}
                            style={{ fontSize: '12px', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', color: '#374151', maxWidth: '160px' }}
                          >
                            <option value="">— no match —</option>
                            {pricing.map(p => <option key={p.productId} value={p.productId}>{p.productName}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>
                        {line.matchedUnitPrice ? `£${line.matchedUnitPrice.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <input
                          type="number" min={1}
                          value={line.quantity}
                          onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 1)}
                          style={{ width: '56px', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', textAlign: 'right', outline: 'none' }}
                        />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                        {line.matchedUnitPrice ? `£${(line.quantity * line.matchedUnitPrice).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => removeLine(i)} style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 14px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>
                Subtotal £{subtotal.toFixed(2)} · VAT £{(subtotal * VAT_RATE).toFixed(2)} ·{' '}
                <strong style={{ color: '#111' }}>Total £{(subtotal * 1.2).toFixed(2)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <Button variant="secondary" onClick={() => setStep('input')}>← Back</Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} loading={saving} disabled={!selectedAccountId || matchedCount === 0}>
                  Create order ({matchedCount} items)
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}