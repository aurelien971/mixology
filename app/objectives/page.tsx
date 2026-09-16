'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import Header from '@/components/layout/Header'
import { getRollouts } from '@/lib/firestore/rollouts'
import { getAllOrders } from '@/lib/firestore/orders'
import { getProducts } from '@/lib/firestore/catalog'
import { getSsbDrinks, getSsbMeta, SsbMeta } from '@/lib/firestore/ssb'
import { venueOrders, effectiveStage, needsAttention } from '@/lib/rollout'
import { SSB_DEFAULT_TRIAL } from '@/lib/ssb'
import { Order, Product, RolloutVenue, SsbDrink } from '@/types'

/**
 * The big objectives, each built for its own job. This page only says where
 * each one stands and takes you into it.
 */

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'

export default function ObjectivesPage() {
  const [venues, setVenues] = useState<RolloutVenue[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [drinks, setDrinks] = useState<SsbDrink[]>([])
  const [meta, setMeta] = useState<SsbMeta>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getRollouts(), getAllOrders(), getProducts(), getSsbDrinks(), getSsbMeta()])
      .then(([v, o, p, d, m]) => { setVenues(v); setOrders(o); setProducts(p); setDrinks(d); setMeta(m) })
      .finally(() => setLoading(false))
  }, [])

  const rangeIds = new Set(products.filter((p) => p.isActive !== false && p.isClassic).map((p) => p.id))
  const rollout = venues.map((v) => {
    const o = venueOrders(v, orders, rangeIds)
    const stage = effectiveStage(v, o)
    return { stage, attention: needsAttention(v, stage, o) }
  })
  const onboarded = rollout.filter((r) => r.stage === 'recurring').length
  const ordering = rollout.filter((r) => r.stage === 'first_order').length
  const needYou = rollout.filter((r) => r.attention).length

  const live = drinks.filter((d) => d.stage !== 'dropped')
  const signed = live.filter((d) => d.stage === 'signed_off').length
  const confirmed = live.filter((d) => d.priceConfirmed).length
  const changes = live.filter((d) => d.stage === 'changes').length
  const trial = meta.trialDate ?? SSB_DEFAULT_TRIAL
  const daysLeft = differenceInCalendarDays(new Date(trial + 'T12:00:00'), startOfDay(new Date()))

  const cards = [
    {
      href: '/objectives/rollout',
      title: 'Rollout',
      purpose: 'Get each venue onto the core range until they reorder it on their own.',
      pct: venues.length ? Math.round((onboarded / venues.length) * 100) : 0,
      headline: `${onboarded} of ${venues.length} venues onboarded`,
      stats: [
        { label: 'Ordering the range', value: ordering },
        { label: 'Need you', value: needYou, warn: needYou > 0 },
        { label: 'Venues', value: venues.length },
      ],
      footer: 'Onboarded = 3 range orders within 6 weeks',
    },
    {
      href: '/objectives/spring-street-bar',
      title: 'Spring Street Bar',
      purpose: 'Review, price and sign off their bespoke menu before the trial service.',
      pct: live.length ? Math.round((signed / live.length) * 100) : 0,
      headline: drinks.length ? `${signed} of ${live.length} drinks signed off` : 'Open to set the menu up',
      stats: [
        { label: 'Prices confirmed', value: `${confirmed}/${live.length}` },
        { label: 'Changes asked', value: changes, warn: changes > 0 },
        { label: 'Trial', value: daysLeft > 0 ? `${daysLeft} days` : daysLeft === 0 ? 'Today' : 'Done', warn: daysLeft >= 0 && daysLeft <= 5 },
      ],
      footer: `Trial service ${format(new Date(trial + 'T12:00:00'), 'EEE d MMM')}`,
    },
  ]

  return (
    <div>
      <Header title="Objectives" subtitle="The big pieces of work, each with its own steps. Click one to run it." />
      {loading ? (
        <p style={{ fontSize: '13px', color: MUTED }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
          {cards.map((c) => (
            <Link key={c.href} href={c.href} style={{ textDecoration: 'none' }}>
              <div
                style={{ background: '#fff', border: '1.5px solid #f3f4f6', borderRadius: '14px', padding: '20px 22px', height: '100%', boxSizing: 'border-box' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = INK)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#f3f4f6')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: INK }}>{c.title}</h2>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: SECONDARY }}>Open →</span>
                </div>
                <p style={{ margin: '4px 0 16px', fontSize: '13px', color: SECONDARY }}>{c.purpose}</p>
                <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: INK }}>{c.headline}</p>
                <div style={{ height: '10px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '14px' }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', background: c.pct === 100 ? '#16a34a' : INK }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {c.stats.map((s) => (
                    <div key={s.label}>
                      <p style={{ margin: 0, fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 600, color: 'warn' in s && s.warn ? '#b45309' : INK }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '14px 0 0', fontSize: '11.5px', color: MUTED }}>{c.footer}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
