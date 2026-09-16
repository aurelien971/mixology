'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow, differenceInCalendarDays } from 'date-fns'
import { RECURRING_ORDERS, RECURRING_WINDOW_DAYS } from '@/lib/rollout'
import { VenueCtx, INK, SECONDARY, MUTED, card, kicker, linkBtn, money } from './shared'

export default function OrdersSection({ ctx }: { ctx: VenueCtx }) {
  const { venue: v, orderInfo: o, menuProductIds } = ctx
  const [older, setOlder] = useState(false)
  const list = older ? o.all : o.since

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ ...card, border: `1.5px solid ${o.recurring ? '#bbf7d0' : '#e5e7eb'}` }}>
        <p style={kicker}>Onboarded when they reorder</p>
        <p style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: o.recurring ? '#166534' : INK }}>
          {o.recurring
            ? `🎉 Onboarded — ${RECURRING_ORDERS} orders from their menu inside ${RECURRING_WINDOW_DAYS / 7} weeks`
            : `${o.inWindow} of ${RECURRING_ORDERS} orders from their menu in the last ${RECURRING_WINDOW_DAYS / 7} weeks`}
        </p>
        <div style={{ display: 'flex', gap: '6px' }}>
          {Array.from({ length: RECURRING_ORDERS }, (_, i) => (
            <span key={i} style={{ flex: 1, height: '8px', borderRadius: '99px', background: o.recurring || i < o.inWindow ? '#16a34a' : '#f3f4f6' }} />
          ))}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: MUTED }}>
          Counts orders since {format(v.startedAt, 'd MMM yyyy')} with at least one drink from their menu or our range.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <p style={{ ...kicker, margin: 0 }}>{older ? `All ${o.all.length} orders` : `${o.since.length} orders since onboarding began`}</p>
          {o.all.length > o.since.length && (
            <button onClick={() => setOlder((x) => !x)} style={linkBtn}>{older ? 'Only since onboarding' : `Show ${o.all.length - o.since.length} older`}</button>
          )}
        </div>
        {list.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>No orders yet. They show up here the moment one comes in.</p>}
        {list.map((ord) => {
          const before = ord.createdAt < v.startedAt
          const mine = ord.lineItems.filter((li) => menuProductIds.has(li.productId))
          const rest = ord.lineItems.filter((li) => !menuProductIds.has(li.productId))
          const fresh = differenceInCalendarDays(new Date(), ord.createdAt) <= 3
          return (
            <div key={ord.id} style={{ padding: '10px 0', borderTop: '1px solid #f9fafb', opacity: before ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{format(ord.createdAt, 'EEE d MMM')}</span>
                {fresh && <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '2px 7px', borderRadius: '20px', background: '#dbeafe', color: '#1d4ed8' }}>NEW</span>}
                <Link href={`/orders/${ord.id}`} style={{ fontSize: '12.5px', color: '#1d4ed8', fontFamily: 'monospace' }}>{ord.orderNumber}</Link>
                <span style={{ fontSize: '12px', color: MUTED }}>{formatDistanceToNow(ord.createdAt, { addSuffix: true }).replace('about ', '')}</span>
                <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{money(ord.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
                {mine.map((li, i) => (
                  <span key={`m${i}`} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#dcfce7', color: '#166534' }}>★ {li.quantity}× {li.productName}</span>
                ))}
                {rest.map((li, i) => (
                  <span key={`r${i}`} style={{ fontSize: '11.5px', padding: '3px 9px', borderRadius: '20px', background: '#f3f4f6', color: SECONDARY }}>{li.quantity}× {li.productName}</span>
                ))}
              </div>
            </div>
          )
        })}
        <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: MUTED }}>★ green = on their menu or our range · grey = anything else</p>
      </div>
    </div>
  )
}
