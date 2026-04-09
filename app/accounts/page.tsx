'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getAccounts } from '@/lib/firestore/accounts'
import { Account } from '@/types'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <Header
        title="Accounts"
        subtitle="All internal and external client accounts"
        action={
          <Button size="sm">+ New account</Button>
        }
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">No accounts yet</p>
          <Button size="sm">Create first account</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Legal name</th>
                <th className="text-left px-5 py-3 font-medium">Trading name</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Payment terms</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900">
                      {account.legalName}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">
                    {account.tradingName}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge
                      label={account.type === 'internal' ? 'Internal' : 'External'}
                      variant={account.type === 'internal' ? 'purple' : 'blue'}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">
                    {account.email}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">
                    {account.paymentTermsDays} days
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
        </div>
      )}
    </div>
  )
}