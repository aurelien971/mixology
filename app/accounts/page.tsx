'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import NewAccountModal from '@/components/accounts/NewAccountModal'
import { getAccounts } from '@/lib/firestore/accounts'
import { copyPortalLink } from '@/lib/portal'
import { Account, PAYMENT_TERMS_LABELS } from '@/types'
import toast from 'react-hot-toast'

export default function AccountsPage() {
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [businessTab, setBusinessTab] = useState<'cocktail' | 'baek'>('cocktail')

  const cocktailAccounts = accounts.filter(a => !a.businessLine || a.businessLine === 'cocktail')
  const baekAccounts     = accounts.filter(a => a.businessLine === 'baek')
  const displayed        = businessTab === 'baek' ? baekAccounts : cocktailAccounts

  function load() {
    getAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false))
  }

  async function handleCopyPortalLink(e: React.MouseEvent, account: Account) {
    e.stopPropagation()
    try {
      const token = await copyPortalLink(account)
      if (!account.clientToken) {
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, clientToken: token } : a))
      }
      toast.success(`Portal link copied for ${account.tradingName}`)
    } catch {
      toast.error('Failed to copy portal link')
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      {showModal && (
        <NewAccountModal
          onClose={() => setShowModal(false)}
          onSaved={() => { load() }}
        />
      )}

      <Header
        title="Accounts"
        subtitle="All client accounts"
        action={<Button size="sm" onClick={() => setShowModal(true)}>+ New account</Button>}
      />

      {/* Business line tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
        {([
          { key: 'cocktail', label: `🍹 Cocktail (${cocktailAccounts.length})` },
          { key: 'baek',     label: `🍷 BAEK (${baekAccounts.length})` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setBusinessTab(key)} style={{
            padding: '6px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
            background: businessTab === key ? '#fff' : 'transparent',
            color: businessTab === key ? '#111827' : '#6b7280',
            boxShadow: businessTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">No accounts yet</p>
          <Button size="sm" onClick={() => setShowModal(true)}>Create first account</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Legal name</th>
                <th className="text-left px-5 py-3 font-medium">Trading name</th>
                <th className="text-left px-5 py-3 font-medium">Group</th>
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Terms</th>
                <th className="text-left px-5 py-3 font-medium">Portal</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayed.map((account) => (
                <tr key={account.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/accounts/${account.id}`}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{account.legalName}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">
                    {account.tradingName}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">
                    {account.groupName ? (
                      <span style={{ background: '#E1F5EE', color: '#0F6E56', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px' }}>
                        {account.groupName}
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: '12px' }}>Standalone</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">
                    {account.email}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">
                    {account.paymentTerms ? PAYMENT_TERMS_LABELS[account.paymentTerms] : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={e => handleCopyPortalLink(e, account)}
                      title={account.clientToken ? `Copy portal link (${account.clientToken})` : 'Generate & copy portal link'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                        cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M5 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9M9 1h4m0 0v4m0-4L6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Copy link
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/accounts/${account.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            {displayed.length} account{accounts.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}