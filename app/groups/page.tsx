'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getGroups } from '@/lib/firestore/groups'
import { getAccounts } from '@/lib/firestore/accounts'
import { Group, Account } from '@/types'

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getGroups(), getAccounts()])
      .then(([g, a]) => { setGroups(g); setAccounts(a) })
      .finally(() => setLoading(false))
  }, [])

  const standalone = accounts.filter(a => !a.groupId)

  return (
    <div>
      <Header
        title="Groups"
        subtitle="Managed client groups and standalone accounts"
      />

      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {groups.map(group => {
            const members = accounts.filter(a => a.groupId === group.id)
            return (
              <div key={group.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: '#0F6E56' }}>
                      {group.name.charAt(0)}
                    </div>
                    <div>
                      <p style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: '#111827' }}>{group.name}</p>
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                        {members.length} venue{members.length !== 1 ? 's' : ''}
                        {group.contactEmail && ` · ${group.contactEmail}`}
                      </p>
                    </div>
                  </div>
                  <Link href={`/groups/${group.id}`}>
                    <Button size="sm">View group</Button>
                  </Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1px', background: '#f9fafb' }}>
                  {members.map(account => (
                    <Link key={account.id} href={`/accounts/${account.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ background: '#fff', padding: '12px 16px', cursor: 'pointer' }}>
                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827', margin: 0 }}>{account.tradingName}</p>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{account.legalName}</p>
                      </div>
                    </Link>
                  ))}
                  {members.length === 0 && (
                    <div style={{ background: '#fff', padding: '16px', gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>No accounts in this group yet</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {standalone.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: '#5F5E5A' }}>
                  S
                </div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: '#111827' }}>Standalone accounts</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                    {standalone.length} account{standalone.length !== 1 ? 's' : ''} — not part of a managed group
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1px', background: '#f9fafb' }}>
                {standalone.map(account => (
                  <Link key={account.id} href={`/accounts/${account.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: '#fff', padding: '12px 16px', cursor: 'pointer' }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827', margin: 0 }}>{account.tradingName}</p>
                      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{account.legalName}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}