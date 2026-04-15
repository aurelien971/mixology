'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getCompanySettings, saveCompanySettings, CompanySettings, DEFAULT_SETTINGS } from '@/lib/firestore/settings'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [form, setForm] = useState<Omit<CompanySettings, 'updatedAt'>>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCompanySettings()
      .then(s => setForm({ ...s }))
      .finally(() => setLoading(false))
  }, [])

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveCompanySettings(form)
      toast.success('Settings saved')
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const field = (label: string, key: keyof typeof form, placeholder = '') => (
    <div key={key}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        {label}
      </label>
      <input
        value={form[key] as string}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
      />
    </div>
  )

  return (
    <div style={{ maxWidth: '640px' }}>
      <Header
        title="Settings"
        subtitle="Company info used on invoices, delivery notes and PDFs"
        action={<Button size="sm" onClick={handleSave} loading={saving}>Save changes</Button>}
      />

      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Company info */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px 24px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 16px' }}>Company info</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {field('Supplier name',    'supplierName',    'Foodlab Cocktails')}
              {field('VAT number',       'vatNumber',       'GB123456789')}
              {field('Address',          'supplierAddress', 'London, UK')}
              {field('Phone',            'supplierPhone',   '+44 20 ...')}
              {field('Email',            'supplierEmail',   'orders@foodlab.com')}
            </div>
          </div>

          {/* Bank details */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '20px 24px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>Bank details</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 16px' }}>These appear on every invoice PDF.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {field('Account name',   'bankAccountName',   'Foodlab Ltd')}
              {field('Sort code',      'bankSortCode',      'XX-XX-XX')}
              {field('Account number', 'bankAccountNumber', 'XXXXXXXX')}
              <div style={{ gridColumn: '1 / -1' }}>
                {field('Payment reference note', 'bankReference', 'Please quote invoice number as reference')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleSave} loading={saving}>Save changes</Button>
          </div>
        </div>
      )}
    </div>
  )
}