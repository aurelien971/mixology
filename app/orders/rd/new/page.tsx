'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getAccounts } from '@/lib/firestore/accounts'
import { createOrder, generateOrderNumber } from '@/lib/firestore/orders'
import { createPayment } from '@/lib/firestore/payments'
import { getDocs, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Account } from '@/types'
import toast from 'react-hot-toast'

const VAT = 0.20

export default function NewRdPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [accountId,  setAccountId]  = useState('')
  const [assignee,   setAssignee]   = useState('')
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [brief,      setBrief]      = useState('')
  const [price,      setPrice]      = useState('')
  const [vatIncl,    setVatIncl]    = useState(false)

  useEffect(() => {
    async function load() {
      const [accs, staffSnap] = await Promise.all([
        getAccounts(),
        getDocs(collection(db, 'staffUsers')),
      ])
      setAccounts(accs)
      setTeamMembers(staffSnap.docs.map(d => (d.data() as any).displayName).sort())
    }
    load()
  }, [])

  const selectedAccount = accounts.find(a => a.id === accountId) ?? null

  // Price calcs
  const priceNum   = parseFloat(price) || 0
  const subtotal   = vatIncl ? Math.round((priceNum / 1.2) * 100) / 100 : priceNum
  const vatAmount  = Math.round(subtotal * VAT * 100) / 100
  const total      = Math.round((subtotal + vatAmount) * 100) / 100

  async function handleCreate() {
    if (!accountId) return toast.error('Select an account')
    if (!assignee)  return toast.error('Select a team member')
    if (!brief.trim()) return toast.error('Add a brief description')

    setSaving(true)
    try {
      const orderNumber   = await generateOrderNumber()
      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`

      const orderData: any = {
        orderNumber,
        invoiceNumber,
        accountId,
        accountName: selectedAccount!.tradingName,
        type:        'rd',
        status:      'received',
        rdStatus:    'in_progress',
        category:    assignee.toLowerCase().includes('majken') ? 'wine_consulting' : 'cocktail_rd',
        rdAssignee:  assignee,
        rdBrief:     brief.trim(),
        rdOutcomes:  [],
        lineItems:   [],
        subtotal:    priceNum > 0 ? subtotal : 0,
        vatRate:     VAT,
        vatAmount:   priceNum > 0 ? vatAmount : 0,
        total:       priceNum > 0 ? total : 0,
        rdPrice:     priceNum > 0 ? priceNum : 0,
        notes:       `R&D project. Assigned to ${assignee}.`,
      }
      if (startDate) orderData.rdStartDate = new Date(startDate)
      if (endDate)   orderData.rdEndDate   = new Date(endDate)
      if (selectedAccount?.groupId)   orderData.groupId   = selectedAccount.groupId
      if (selectedAccount?.groupName) orderData.groupName = selectedAccount.groupName

      const orderId = await createOrder(orderData)

      // Only create payment if price is set
      if (priceNum > 0) {
        const termsDays = selectedAccount?.paymentTerms === 'net_14' ? 14
          : selectedAccount?.paymentTerms === 'net_60' ? 60 : 30
        await createPayment({
          orderId,
          orderNumber,
          accountId,
          accountName: selectedAccount!.tradingName,
          invoiceNumber,
          amount:  total,
          dueDate: addDays(new Date(), termsDays),
          status:  'pending',
        })
      }

      toast.success(`R&D project ${orderNumber} created`)
      router.push(`/orders/${orderId}`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <Header
        title="New R&D project"
        subtitle="Research & development for a client account"
        action={
          <Button variant="secondary" size="sm" onClick={() => router.back()}>← Back</Button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Account + Assignee */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 16px' }}>Project details</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Account *</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                style={sel}
              >
                <option value="">Select account...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.tradingName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={lbl}>Assigned to *</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {teamMembers.map(t => (
                  <button
                    key={t}
                    onClick={() => setAssignee(t)}
                    style={{
                      padding: '9px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                      cursor: 'pointer', border: `1px solid ${assignee === t ? '#111827' : '#e5e7eb'}`,
                      background: assignee === t ? '#111827' : '#fff',
                      color: assignee === t ? '#fff' : '#374151',
                    }}
                  >{t}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={lbl}>Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
            </div>

            <div>
              <label style={lbl}>Expected end date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inp} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Brief *</label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="What is the client looking for? E.g. 3 signature cocktails for summer menu, Mediterranean-inspired, no-ABV option required..."
                rows={4}
                style={{ ...inp, resize: 'none' as const }}
              />
            </div>
          </div>
        </div>

        {/* Pricing — optional */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>Pricing</p>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Can be added later</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>R&D fee (£)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '14px' }}>£</span>
                <input
                  type="number" min="0" step="0.01"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  style={{ ...inp, paddingLeft: '28px' }}
                />
              </div>
            </div>

            <div>
              <label style={lbl}>Price includes VAT?</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[{ v: false, l: 'Ex-VAT' }, { v: true, l: 'Inc. VAT' }].map(({ v, l }) => (
                  <button
                    key={l}
                    onClick={() => setVatIncl(v)}
                    style={{
                      flex: 1, padding: '9px 4px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                      cursor: 'pointer', border: `1px solid ${vatIncl === v ? '#111827' : '#e5e7eb'}`,
                      background: vatIncl === v ? '#111827' : '#fff',
                      color: vatIncl === v ? '#fff' : '#374151',
                    }}
                  >{l}</button>
                ))}
              </div>
            </div>
          </div>

          {priceNum > 0 && (
            <div style={{ marginTop: '14px', padding: '12px 16px', background: '#f9fafb', borderRadius: '8px', display: 'flex', gap: '24px', fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>Subtotal: <strong style={{ color: '#111827' }}>£{subtotal.toFixed(2)}</strong></span>
              <span style={{ color: '#6b7280' }}>VAT: <strong style={{ color: '#111827' }}>£{vatAmount.toFixed(2)}</strong></span>
              <span style={{ color: '#6b7280' }}>Total: <strong style={{ color: '#111827', fontSize: '14px' }}>£{total.toFixed(2)}</strong></span>
            </div>
          )}

          {!priceNum && (
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '12px 0 0' }}>
              No price set — you can add it later from the project page. No invoice will be created until a price is set.
            </p>
          )}
        </div>

        <Button onClick={handleCreate} loading={saving}>
          Create R&D project
        </Button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff' }
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }