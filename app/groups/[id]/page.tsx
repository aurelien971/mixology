'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import DownloadPriceListButton from '@/components/accounts/DownloadPriceListButton'
import { getGroup } from '@/lib/firestore/groups'
import { getAccountsByGroup } from '@/lib/firestore/accounts'
import { getPricingByGroup } from '@/lib/firestore/catalog'
import { Group, Account, AccountPricing } from '@/types'

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [group, setGroup] = useState<Group | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [g, a, p] = await Promise.all([
        getGroup(id),
        getAccountsByGroup(id),
        getPricingByGroup(id),
      ])
      setGroup(g)
      setAccounts(a)
      setPricing(p)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2rem' }}>Loading...</p>
  if (!group) return <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2rem' }}>Group not found</p>

  // Stats
  const totalPricingLines = pricing.length
  const venuesWithPricing = new Set(pricing.map(p => p.accountName)).size
  const avgVenueGp = pricing.length > 0
    ? pricing.reduce((s, p) => s + p.venueGpPercent, 0) / pricing.length
    : 0

  // Group pricing by account for the table preview
  const byAccount: Record<string, AccountPricing[]> = {}
  for (const row of pricing) {
    if (!byAccount[row.accountName]) byAccount[row.accountName] = []
    byAccount[row.accountName].push(row)
  }

  return (
    <div>
      <Header
        title={group.name}
        subtitle={`${accounts.length} venues · ${totalPricingLines} pricing lines`}
        action={
          <DownloadPriceListButton
            mode="group"
            groupId={id}
            groupName={group.name}
          />
        }
      />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {[
          { label: 'Venues', value: accounts.length.toString() },
          { label: 'Venues with pricing', value: venuesWithPricing.toString() },
          { label: 'Total cocktail lines', value: totalPricingLines.toString() },
          { label: 'Avg venue GP', value: `${avgVenueGp.toFixed(1)}%` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 20px', minWidth: '120px' }}>
            <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 500 }}>{label}</p>
            <p style={{ fontSize: '22px', fontWeight: 600, color: '#111827', margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Venues grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {accounts.map(account => {
          const lines = byAccount[account.tradingName] ?? []
          const avgGp = lines.length > 0
            ? lines.reduce((s, p) => s + p.venueGpPercent, 0) / lines.length
            : null

          return (
            <div key={account.id} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{account.tradingName}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{account.legalName}</p>
                </div>
                <Link href={`/accounts/${account.id}`}>
                  <button style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
                    View
                  </button>
                </Link>
              </div>
              <div style={{ padding: '10px 16px', display: 'flex', gap: '20px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cocktails</p>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>{lines.length}</p>
                </div>
                {avgGp !== null && (
                  <div>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg GP</p>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: avgGp >= 75 ? '#166534' : '#854d0e', margin: 0 }}>{avgGp.toFixed(1)}%</p>
                  </div>
                )}
                {lines.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#f59e0b', alignSelf: 'center', margin: 0 }}>No pricing set up</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pricing preview table */}
      {Object.keys(byAccount).length > 0 && (
        <div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
            Pricing preview
          </p>
          {Object.entries(byAccount).map(([venueName, rows]) => (
            <div key={venueName} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
              <div style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>{venueName}</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ color: '#9ca3af', borderBottom: '1px solid #f9fafb' }}>
                    <th style={{ textAlign: 'left', padding: '8px 16px', fontWeight: 500 }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '8px 16px', fontWeight: 500 }}>Cocktail</th>
                    <th style={{ textAlign: 'right', padding: '8px 16px', fontWeight: 500 }}>Serve</th>
                    <th style={{ textAlign: 'right', padding: '8px 16px', fontWeight: 500 }}>Price/unit</th>
                    <th style={{ textAlign: 'right', padding: '8px 16px', fontWeight: 500 }}>Price/L</th>
                    <th style={{ textAlign: 'right', padding: '8px 16px', fontWeight: 500 }}>RRP</th>
                    <th style={{ textAlign: 'right', padding: '8px 16px', fontWeight: 500 }}>GP%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f9fafb', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: '8px 16px', fontFamily: 'monospace', color: '#9ca3af' }}>{row.productCode}</td>
                      <td style={{ padding: '8px 16px', fontWeight: 500, color: '#111827' }}>{row.productName}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: '#6b7280' }}>{row.recommendedServingG}ml</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>£{row.pricePerUnit.toFixed(2)}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: '#6b7280' }}>£{(row.pricePerLitre || (row.pricePerUnit / row.recommendedServingG * 1000)).toFixed(2)}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: '#6b7280' }}>£{row.rrp.toFixed(2)}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: row.venueGpPercent >= 75 ? '#166534' : '#854d0e' }}>
                        {row.venueGpPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '8px' }}>
        <Link href="/groups" style={{ fontSize: '12px', color: '#9ca3af', textDecoration: 'none' }}>← Back to groups</Link>
      </div>
    </div>
  )
}