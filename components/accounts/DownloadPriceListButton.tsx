'use client'

import { useState } from 'react'
import { AccountPricing } from '@/types'
import { getPricingByGroup } from '@/lib/firestore/catalog'
import { getAccountsByGroup } from '@/lib/firestore/accounts'
import { PriceListColumns, DEFAULT_COLUMNS } from '@/lib/pdf/priceList'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface SingleAccountProps {
  mode: 'account'
  account: { tradingName: string; legalName: string }
  pricing: AccountPricing[]
}

interface GroupProps {
  mode: 'group'
  groupId: string
  groupName: string
}

type Props = SingleAccountProps | GroupProps

const COLUMN_OPTIONS: { key: keyof PriceListColumns; label: string; description: string }[] = [
  { key: 'serveML',      label: 'Serve size (ml)',       description: 'Recommended serving size' },
  { key: 'qtyPerL',      label: 'Servings per litre',    description: 'How many serves per litre' },
  { key: 'pricePerUnit', label: 'Price per unit',        description: 'Your price per serving' },
  { key: 'pricePerL',    label: 'Price per litre',       description: 'Your price per litre' },
  { key: 'rrp',          label: 'RRP',                   description: 'Recommended retail price' },
  { key: 'gpPercent',    label: 'GP %',                  description: "Venue's gross profit margin" },
]

export default function DownloadPriceListButton(props: Props) {
  const [showModal, setShowModal] = useState(false)
  const [columns, setColumns] = useState<PriceListColumns>({ ...DEFAULT_COLUMNS })
  const [exporting, setExporting] = useState(false)

  function toggleColumn(key: keyof PriceListColumns) {
    setColumns(c => ({ ...c, [key]: !c[key] }))
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { PriceListPDF } = await import('@/lib/pdf/priceList')
      const { default: React } = await import('react')

      let blob: Blob
      let filename: string

      if (props.mode === 'account') {
        if (props.pricing.length === 0) {
          toast.error('No pricing set up for this account yet')
          return
        }
        blob = await pdf(
          React.createElement(PriceListPDF, {
            account: props.account,
            pricing: props.pricing,
            columns,
          }) as any
        ).toBlob()
        filename = `${props.account.tradingName.replace(/\s+/g, '-')}-Price-List.pdf`
      } else {
        const [groupPricing, accounts] = await Promise.all([
          getPricingByGroup(props.groupId),
          getAccountsByGroup(props.groupId),
        ])
        if (groupPricing.length === 0) {
          toast.error('No pricing found for this group')
          return
        }
        const accountLegalNames: Record<string, string> = {}
        for (const a of accounts) accountLegalNames[a.tradingName] = a.legalName
        blob = await pdf(
          React.createElement(PriceListPDF, {
            groupName: props.groupName,
            groupPricing,
            accountLegalNames,
            columns,
          }) as any
        ).toBlob()
        filename = `${props.groupName.replace(/\s+/g, '-')}-Group-Price-List.pdf`
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Price list downloaded')
      setShowModal(false)
    } catch (e) {
      console.error(e)
      toast.error('Failed to generate PDF')
    } finally {
      setExporting(false)
    }
  }

  const selectedCount = Object.values(columns).filter(Boolean).length

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowModal(true)}
      >
        {props.mode === 'group' ? 'Export group price list' : 'Export price list'}
      </Button>

      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div style={{
            background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px',
            margin: '0 20px', border: '1px solid #e5e7eb', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Export price list</h2>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '3px 0 0' }}>
                  Choose which columns to include
                </p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>

            {/* Column toggles */}
            <div style={{ padding: '8px 22px 4px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 8px' }}>
                Always included
              </p>
              {['Product code', 'Cocktail name'].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
                  <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>Always on</span>
                </div>
              ))}

              <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>
                Optional columns
              </p>
              {COLUMN_OPTIONS.map(({ key, label, description }) => (
                <div
                  key={key}
                  onClick={() => toggleColumn(key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', margin: '4px 0', borderRadius: '10px', cursor: 'pointer',
                    background: columns[key] ? '#f0fdf4' : '#f9fafb',
                    border: `1px solid ${columns[key] ? '#bbf7d0' : '#f3f4f6'}`,
                    transition: 'all 0.1s',
                  }}
                >
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: columns[key] ? '#166534' : '#374151', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '11px', color: columns[key] ? '#4ade80' : '#9ca3af', margin: '1px 0 0' }}>{description}</p>
                  </div>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, marginLeft: '12px',
                    border: `1.5px solid ${columns[key] ? '#166534' : '#d1d5db'}`,
                    background: columns[key] ? '#166534' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {columns[key] && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                {selectedCount + 2} columns · Code + Cocktail + {selectedCount} optional
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button size="sm" onClick={handleExport} loading={exporting}>
                  Export PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}