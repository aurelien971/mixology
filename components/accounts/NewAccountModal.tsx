'use client'

import { useState, useEffect } from 'react'
import { createAccount } from '@/lib/firestore/accounts'
import { getGroups } from '@/lib/firestore/groups'
import { Group, PaymentTerms, PAYMENT_TERMS_LABELS } from '@/types'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onSaved: () => void
}

const PAYMENT_TERMS: PaymentTerms[] = ['net_14', 'net_30', 'net_60', 'upfront', 'split_50']

export default function NewAccountModal({ onClose, onSaved }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    legalName:    '',
    tradingName:  '',
    email:        '',
    phone:        '',
    vatNumber:    '',
    paymentTerms: 'net_30' as PaymentTerms,
    groupId:      '',
    line1:        '',
    line2:        '',
    city:         'London',
    postcode:     '',
    notes:        '',
  })

  useEffect(() => { getGroups().then(setGroups) }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.legalName.trim())   return toast.error('Legal name is required')
    if (!form.tradingName.trim()) return toast.error('Trading name is required')
    if (!form.email.trim())       return toast.error('Email is required')

    setSaving(true)
    try {
      const group = groups.find(g => g.id === form.groupId)

      const data: any = {
        legalName:    form.legalName.trim(),
        tradingName:  form.tradingName.trim(),
        type:         'internal',
        email:        form.email.trim(),
        paymentTerms: form.paymentTerms,
        address: {
          line1:    form.line1.trim(),
          city:     form.city.trim(),
          postcode: form.postcode.trim(),
        },
      }

      // Only add optional fields if they have a value — Firestore rejects undefined
      if (form.phone.trim())     data.phone     = form.phone.trim()
      if (form.vatNumber.trim()) data.vatNumber  = form.vatNumber.trim()
      if (form.notes.trim())     data.notes      = form.notes.trim()
      if (form.line2.trim())     data.address.line2 = form.line2.trim()
      if (group)                 data.groupId    = group.id
      if (group)                 data.groupName  = group.name

      await createAccount(data)
      toast.success(`${form.tradingName} created`)
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  const field = (
    label: string, key: string, placeholder = '',
    opts?: { required?: boolean; span?: boolean; type?: string }
  ) => (
    <div key={key} style={opts?.span ? { gridColumn: '1 / -1' } : {}}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
        {label}{opts?.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </label>
      <input
        type={opts?.type ?? 'text'}
        value={(form as any)[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
      />
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '48px', paddingBottom: '40px', zIndex: 50 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '86vh', overflow: 'auto', margin: '0 20px', border: '1px solid #e5e7eb' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>New account</h2>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Client identity */}
          <section>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Client identity</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Legal name', 'legalName', 'e.g. Pyro Restaurant Group Ltd', { required: true, span: true })}
              {field('Trading name', 'tradingName', 'e.g. Pyro', { required: true })}
              {field('VAT number', 'vatNumber', 'GB123456789')}
            </div>
          </section>

          {/* Group */}
          <section>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Group</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                  Group (optional)
                </label>
                <select
                  value={form.groupId}
                  onChange={e => set('groupId', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}
                >
                  <option value="">Standalone (no group)</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Contact</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Email', 'email', 'orders@venue.com', { required: true })}
              {field('Phone', 'phone', '+44 20...')}
            </div>
          </section>

          {/* Address */}
          <section>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Delivery address</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Address line 1', 'line1', '53b Southwark St', { span: true })}
              {field('Address line 2', 'line2', 'Floor, Unit, etc.', { span: true })}
              {field('City', 'city', 'London')}
              {field('Postcode', 'postcode', 'SE1 1RU')}
            </div>
          </section>

          {/* Terms */}
          <section>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Payment terms</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PAYMENT_TERMS.map(t => (
                <button
                  key={t}
                  onClick={() => set('paymentTerms', t)}
                  style={{
                    padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                    border: `1px solid ${form.paymentTerms === t ? '#111827' : '#e5e7eb'}`,
                    background: form.paymentTerms === t ? '#111827' : '#fff',
                    color: form.paymentTerms === t ? '#fff' : '#374151',
                    cursor: 'pointer',
                  }}
                >
                  {PAYMENT_TERMS_LABELS[t]}
                </button>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any internal notes about this account..."
              rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
            />
          </section>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Create account</Button>
          </div>
        </div>
      </div>
    </div>
  )
}