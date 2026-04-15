'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import NewAccountModal from '@/components/accounts/NewAccountModal'
import { getAccounts } from '@/lib/firestore/accounts'
import { Account, PAYMENT_TERMS_LABELS } from '@/types'

export default function AccountsPage() {
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)

  function load() {
    getAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false))
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

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : accounts.length === 0 ? (
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
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
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
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}