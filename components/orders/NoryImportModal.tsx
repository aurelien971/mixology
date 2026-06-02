'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccounts } from '@/lib/firestore/accounts'
import { getProducts } from '@/lib/firestore/catalog'
import { createOrder, generateOrderNumber } from '@/lib/firestore/orders'
import { createPayment } from '@/lib/firestore/payments'
import { Account, Product } from '@/types'
import Button from '@/components/ui/Button'
import { addDays } from 'date-fns'
import toast from 'react-hot-toast'

interface ParsedNoryRow {
  product_code: string
  product_name: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
  customer_number: string
  order_number: string
  customer_name: string
  requested_delivery_date: string
  delivery_address: string
  reply_to: string
}

interface PreviewLine {
  productCode: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  volumeLitres: number
  productId: string | null
  matched: boolean
}

interface Props {
  onClose: () => void
  onCreated: () => void
}

const VAT = 0.20

function parseCSV(text: string): ParsedNoryRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

  return lines.slice(1).filter(l => l.trim()).map(line => {
    // Handle quoted fields with commas inside
    const fields: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    fields.push(cur.trim())

    const row: any = {}
    headers.forEach((h, i) => { row[h] = fields[i] ?? '' })
    return {
      product_code:           row.product_code ?? '',
      product_name:           row.product_name ?? '',
      quantity:               parseInt(row.quantity) || 1,
      unit:                   row.unit ?? '',
      unit_price:             parseFloat((row.unit_price ?? '').replace('£', '')) || 0,
      total_price:            parseFloat((row.total_price ?? '').replace('£', '')) || 0,
      customer_number:        row.customer_number ?? '',
      order_number:           row.order_number ?? '',
      customer_name:          row.customer_name ?? '',
      requested_delivery_date:row.requested_delivery_date ?? '',
      delivery_address:       row.delivery_address ?? '',
      reply_to:               row.reply_to ?? '',
    } as ParsedNoryRow
  })
}

// Extract volume from unit string
// "1 * 5 litre" → 5
// "1 * 19000 millilitre" → 19  (19000ml = 19L)
// "1 * 19 litre" → 19
function extractVolume(unit: string): number {
  const mlMatch = unit.match(/(\d+)\s*millilitre/i)
  if (mlMatch) return Math.round(parseInt(mlMatch[1]) / 1000)
  const lMatch = unit.match(/(\d+)\s*litre/i)
  if (lMatch) return parseInt(lMatch[1])
  return 5
}

export default function NoryImportModal({ onClose, onCreated }: Props) {
  const [step, setStep]         = useState<'upload' | 'preview' | 'saving'>('upload')
  const [dragging, setDragging] = useState(false)
  const [rows, setRows]         = useState<ParsedNoryRow[]>([])
  const [account, setAccount]   = useState<Account | null>(null)
  const [lines, setLines]       = useState<PreviewLine[]>([])
  const [poRef, setPoRef]       = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [saving, setSaving]     = useState(false)
  const router = useRouter()

  async function processFile(file: File) {
    if (!file.name.endsWith('.csv')) return toast.error('Please upload a .csv file')
    const text = await file.text()
    const parsed = parseCSV(text)
    if (!parsed.length) return toast.error('Could not parse CSV — check the format')

    const first = parsed[0]

    // Normalize company name — "Limited" = "Ltd", "Company" = "Co", etc.
    function norm(s: string) {
      return s.toLowerCase()
        .replace(/\blimited\b/g, 'ltd')
        .replace(/\bcompany\b/g, 'co')
        .replace(/[.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Match account by legal name (customer_number field)
    const accounts = await getAccounts()
    const csvLegal   = norm(first.customer_number)
    const csvTrading = norm(first.customer_name.replace(/culinary collective\s*/i, '').trim())
    const matched = accounts.find(a =>
      norm(a.legalName) === csvLegal ||
      norm(a.tradingName) === csvLegal ||
      norm(a.legalName) === csvTrading ||
      norm(a.tradingName) === csvTrading
    ) ?? null

    // Match products by code
    const products = await getProducts()
    const productByCode = new Map(products.map(p => [p.productCode.toLowerCase(), p]))

    const previewLines: PreviewLine[] = parsed.map(row => {
      const product = productByCode.get(row.product_code.toLowerCase()) ?? null
      const vol = product?.volumeLitres
        ? product.volumeLitres          // always trust the product document first
        : extractVolume(row.unit)       // fallback: parse from "1 * 19000 millilitre"
      return {
        productCode:  row.product_code,
        productName:  row.product_name,
        quantity:     row.quantity,
        unitPrice:    row.unit_price,
        lineTotal:    row.total_price,
        volumeLitres: vol,
        productId:    product?.id ?? null,
        matched:      !!product,
      }
    })

    setRows(parsed)
    setAccount(matched)
    setLines(previewLines)
    setPoRef(first.order_number)
    setDeliveryDate(first.requested_delivery_date)
    setStep('preview')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  const vatAmt   = Math.round(subtotal * VAT * 100) / 100
  const total    = Math.round((subtotal + vatAmt) * 100) / 100

  async function handleCreate() {
    if (!account) return toast.error('No matching account found — please match manually')
    const matched = lines.filter(l => l.productId)
    if (matched.length === 0) return toast.error('No matched products — nothing to create')
    const unmatched = lines.filter(l => !l.productId)
    if (unmatched.length) toast(`Skipping ${unmatched.length} unmatched row${unmatched.length > 1 ? 's' : ''}`)

    setSaving(true)
    setStep('saving')
    try {
      const orderNumber = await generateOrderNumber()
      const invoiceNumber = `INV-${new Date().getFullYear()}-${orderNumber.replace('FL-', '').padStart(4, '0')}`

      const orderId = await createOrder({
        orderNumber,
        invoiceNumber,
        accountId:   account.id,
        accountName: account.tradingName,
        lineItems:   lines.filter(l => l.productId).map(l => ({
          productId:    l.productId!,
          productCode:  l.productCode,
          productName:  l.productName,
          volumeLitres: l.volumeLitres,
          quantity:     l.quantity,
          unitPrice:    l.unitPrice,
          lineTotal:    l.lineTotal,
          servingSizeG: 0,
        })),
        subtotal,
        vatRate:   VAT,
        vatAmount: vatAmt,
        total,
        status:      'received',
        category:    'cocktail_production',
        poReference: poRef,
        ...(deliveryDate ? { expectedDeliveryDate: new Date(deliveryDate) } : {}),
        notes: `Imported from Nory order ${poRef}`,
      })

      const terms = account.paymentTerms
      const termDays = terms === 'net_14' ? 14 : terms === 'net_60' ? 60 : 30

      await createPayment({
        orderId,
        orderNumber,
        accountId:   account.id,
        accountName: account.tradingName,
        invoiceNumber,
        amount:  total,
        dueDate: addDays(new Date(), termDays),
        status:  'pending',
      })

      toast.success(`Order ${orderNumber} created`)
      onCreated()
      router.push(`/orders/${orderId}`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to create order')
      setSaving(false)
      setStep('preview')
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '48px', paddingBottom: '40px', zIndex: 50 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '86vh', overflow: 'auto', margin: '0 20px', border: '1px solid #e5e7eb' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Import from Nory</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0' }}>Upload the .csv attachment from the Nory order email</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <label
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '48px 24px', borderRadius: '12px', cursor: 'pointer',
                border: `2px dashed ${dragging ? '#111827' : '#d1d5db'}`,
                background: dragging ? '#f9fafb' : '#fff',
                transition: 'all 0.15s', gap: '12px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4v16M9 11l7-7 7 7M6 24h20" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>
                  Drop the Nory CSV here
                </p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>or click to browse · .csv files only</p>
              </div>
              <input type="file" accept=".csv" onChange={onFileInput} style={{ display: 'none' }} />
            </label>
          )}

          {/* Step 2: Preview */}
          {(step === 'preview' || step === 'saving') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Account match */}
              <div style={{
                padding: '14px 16px', borderRadius: '10px',
                background: account ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${account ? '#bbf7d0' : '#fecaca'}`,
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '18px' }}>{account ? '✓' : '⚠'}</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: account ? '#166534' : '#dc2626', margin: 0 }}>
                    {account ? `Matched: ${account.legalName} (${account.tradingName})` : `No account match for "${rows[0]?.customer_number}"`}
                  </p>
                  {!account && <p style={{ fontSize: '11px', color: '#dc2626', margin: '2px 0 0' }}>Create the account first or check the legal name matches</p>}
                </div>
              </div>

              {/* Order meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>PO Reference</label>
                  <input value={poRef} onChange={e => setPoRef(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>Requested delivery</label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Line items */}
              <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {['Product', 'Code', 'Vol', 'Qty', 'Total', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 14px', fontWeight: 500, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f3f4f6', background: l.matched ? '#fff' : '#fef2f2' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{l.productName}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{l.productCode}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '11px' }}>{l.volumeLitres}L</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>×{l.quantity}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>£{l.lineTotal.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '11px', color: l.matched ? '#166534' : '#dc2626' }}>
                          {l.matched ? '✓' : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                              <span>✗ unmatched</span>
                              <button
                                onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                                style={{ fontSize: '13px', color: '#9ca3af', background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px', cursor: 'pointer', padding: '1px 7px', lineHeight: 1.4 }}
                                title="Remove this row"
                              >Remove</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 14px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: '32px', fontSize: '12px', color: '#6b7280' }}>
                  <span>Subtotal: <strong style={{ color: '#111' }}>£{subtotal.toFixed(2)}</strong></span>
                  <span>VAT (20%): <strong style={{ color: '#111' }}>£{vatAmt.toFixed(2)}</strong></span>
                  <span>Total: <strong style={{ color: '#111', fontSize: '14px' }}>£{total.toFixed(2)}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleCreate} loading={saving} disabled={!account || lines.filter(l => l.matched).length === 0}>
                  Create order
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}