'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow, differenceInCalendarDays } from 'date-fns'
import Button from '@/components/ui/Button'
import NewTastingModal from '@/components/tastings/NewTastingModal'
import { upsertAccountPricing } from '@/lib/firestore/catalog'
import { StaffUser } from '@/lib/firestore/staffUsers'
import { splitRecipeCost } from '@/lib/pricing'
import {
  venueOrders, effectiveStage, stepIndex, nextManualStage, drinkStatus, needsAttention,
  RECURRING_ORDERS, RECURRING_WINDOW_DAYS,
} from '@/lib/rollout'
import {
  Account, AccountPricing, Ingredient, Order, Product, Recipe, RolloutVenue, RolloutContact,
  RangePick, RangeStatus, TastingSession, DevVariant,
  ROLLOUT_STEPS, ROLLOUT_OFF_ROAD, RANGE_STATUSES, DEV_VARIANTS, TASTING_STAGES, TASTING_VERDICTS,
  matchesClassic,
} from '@/types'
import toast from 'react-hot-toast'

type Tab = 'overview' | 'drinks' | 'tastings' | 'orders' | 'timeline'

interface Props {
  venue: RolloutVenue
  account?: Account
  accounts: Account[]
  products: Product[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  orders: Order[]
  tastings: TastingSession[]
  pricing: AccountPricing[]
  staff: StaffUser[]
  onPatch: (data: Partial<RolloutVenue>, note?: string, auto?: string) => Promise<void>
  onReload: () => void
  onClose: () => void
  onRemove: () => Promise<void>
}

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }
const kicker: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13.5px', color: '#374151', border: '1px solid #e5e7eb',
  borderRadius: '8px', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit',
}

const money = (n: number) => '£' + n.toFixed(2)
const newId = () => Math.random().toString(36).slice(2, 10)
const dayAt = (d: string) => new Date(d + 'T12:00:00')

export default function VenuePanel({
  venue: v, account, accounts, products, recipes, ingredients, orders, tastings, pricing, staff,
  onPatch, onReload, onClose, onRemove,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [booking, setBooking] = useState(false)
  const [note, setNote] = useState('')
  const [drinkFilter, setDrinkFilter] = useState<'all' | 'picked' | 'agreed'>('all')
  const [drinkFormat, setDrinkFormat] = useState<DevVariant>('premix')
  const [olderOrders, setOlderOrders] = useState(false)
  const [newContact, setNewContact] = useState<RolloutContact | null>(null)

  const classics = useMemo(
    () => products
      .filter((p) => p.isActive !== false && p.isClassic)
      .sort((a, b) => (matchesClassic(a.name) ?? a.name).localeCompare(matchesClassic(b.name) ?? b.name)),
    [products]
  )
  const rangeIds = useMemo(() => new Set(classics.map((p) => p.id)), [classics])
  const o = useMemo(() => venueOrders(v, orders, rangeIds), [v, orders, rangeIds])
  const stage = effectiveStage(v, o)
  const idx = stepIndex(stage)
  const offRoad = ROLLOUT_OFF_ROAD.find((s) => s.value === stage)
  const attention = needsAttention(v, stage, o)
  const venueTastings = useMemo(
    () => tastings.filter((t) => t.accountId === v.accountId)
      .sort((a, b) => (b.scheduledAt ?? b.createdAt).getTime() - (a.scheduledAt ?? a.createdAt).getTime()),
    [tastings, v.accountId]
  )

  const costs = useMemo(() => {
    const m: Record<string, { premix: number | null; syrup: number | null }> = {}
    for (const p of classics) {
      const r = recipes.find((x) => x.productId === p.id)
      if (!r) { m[p.id] = { premix: null, syrup: null }; continue }
      const split = splitRecipeCost(r, ingredients)
      m[p.id] = { premix: split.complete ? split.totalPerLitre : null, syrup: split.mixerPerLitre || null }
    }
    return m
  }, [classics, recipes, ingredients])

  const picks = v.range ?? []
  const pickOf = (productId: string, variant: DevVariant) => picks.find((r) => r.productId === productId && r.variant === variant)
  const drinkName = (p: Product) => matchesClassic(p.name) ?? p.name

  const rows = classics.flatMap((p) => DEV_VARIANTS.map((vt) => {
    const variant = vt.value as DevVariant
    const pick = pickOf(p.id, variant)
    const s = drinkStatus(pick?.status, p.id, variant, venueTastings)
    const cost = costs[p.id]?.[variant] ?? null
    const onList = variant === 'premix' ? pricing.find((x) => x.accountId === v.accountId && x.productId === p.id) : undefined
    return { p, variant, short: vt.short, pick, status: s.status, fromTasting: s.fromTasting, cost, onList }
  }))
  const picked = rows.filter((r) => r.status === 'yes' || r.status === 'maybe')
  // With spirit and without are separate conversations with a venue, so each
  // gets its own list rather than forty rows interleaved.
  const formatRows = rows.filter((r) => r.variant === drinkFormat)
  const formatCount = (variant: DevVariant) => {
    const list = rows.filter((r) => r.variant === variant)
    return {
      picked: list.filter((r) => r.status === 'yes' || r.status === 'maybe').length,
      priced: list.filter((r) => r.pick?.pricePerLitre).length,
      agreed: list.filter((r) => r.pick?.agreed).length,
    }
  }
  const fc = formatCount(drinkFormat)
  const shownRows = drinkFilter === 'picked' ? formatRows.filter((r) => r.status === 'yes' || r.status === 'maybe' || r.pick?.agreed)
    : drinkFilter === 'agreed' ? formatRows.filter((r) => r.pick?.agreed) : formatRows

  async function setPick(p: Product, variant: DevVariant, patch: Partial<RangePick>, auto: string) {
    const exists = pickOf(p.id, variant)
    const next: RangePick[] = exists
      ? picks.map((r) => (r.productId === p.id && r.variant === variant ? { ...r, ...patch } : r))
      : [...picks, { productId: p.id, variant, ...patch }]
    await onPatch({ range: next }, undefined, auto)
  }

  async function agree(row: (typeof rows)[number], on: boolean) {
    const label = `${drinkName(row.p)} (${row.short})`
    if (!on) return setPick(row.p, row.variant, { agreed: false }, `${label}: price no longer agreed`)
    const price = row.pick?.pricePerLitre
    if (!price) return toast.error('Put a price in first')
    await setPick(row.p, row.variant, { agreed: true }, `${label}: price agreed at ${money(price)}/L`)
    // The with-spirit drink is the product they order, so its agreed price goes
    // on their price list — the one orders are actually priced from.
    if (row.variant === 'premix' && account) {
      const vol = row.onList?.volumeLitres ?? 5
      const gp = row.cost ? Math.round(((price - row.cost) / price) * 10000) / 100 : 0
      try {
        await upsertAccountPricing({
          accountId: account.id,
          accountName: account.tradingName || account.legalName,
          groupId: account.groupId,
          groupName: account.groupName,
          productId: row.p.id,
          productCode: row.p.productCode,
          productName: row.p.name,
          volumeLitres: vol,
          recommendedServingG: row.p.recommendedServingG || 100,
          pricePerUnit: Math.round(price * vol * 100) / 100,
          pricePerLitre: price,
          rrp: row.onList?.rrp ?? 0,
          venueGpPercent: row.onList?.venueGpPercent ?? 0,
          foodlabGpPercent: gp,
        })
        toast.success(`${drinkName(row.p)} added to ${v.name}'s price list`)
        onReload()
      } catch {
        toast.error('Agreed here, but could not update their price list')
      }
    }
  }

  // ── the one button that matters ─────────────────────────────────────────
  const next = nextManualStage(stage)
  const primary: { label: string; run: () => void } | null =
    stage === 'not_started' ? { label: '+ Add the main contact', run: () => { setTab('overview'); setNewContact({ id: newId(), name: '' }) } }
    : stage === 'contact' ? { label: 'Book a tasting', run: () => setBooking(true) }
    : stage === 'tasting_booked' ? { label: 'Open the tasting', run: () => setTab('tastings') }
    : stage === 'tasted' ? { label: 'Tick their drinks', run: () => setTab('drinks') }
    : stage === 'range_chosen' ? { label: 'Set the prices', run: () => setTab('drinks') }
    : stage === 'pricing_sent' ? { label: 'See the prices', run: () => { setTab('drinks'); setDrinkFilter('picked') } }
    : stage === 'pricing_agreed' || stage === 'first_order' ? { label: 'See their orders', run: () => setTab('orders') }
    : null

  const contacts = v.contacts ?? []

  async function saveContact(c: RolloutContact) {
    if (!c.name.trim()) return toast.error('Give the contact a name')
    const exists = contacts.some((x) => x.id === c.id)
    const list = exists ? contacts.map((x) => (x.id === c.id ? c : x)) : [...contacts, c]
    await onPatch(
      { contacts: list, ...(stage === 'not_started' && !exists ? { stage: 'contact' as const } : {}) },
      undefined,
      exists ? `Contact updated: ${c.name}` : `Contact added: ${c.name}${c.role ? ` (${c.role})` : ''}`
    )
    setNewContact(null)
  }

  // ── timeline: logged changes, tastings and orders, end to end ───────────
  const timeline = useMemo(() => {
    const items: { at: Date; text: string; by?: string; tone: 'note' | 'auto' | 'order' | 'tasting'; href?: string }[] = []
    for (const u of v.updates ?? []) {
      const at = new Date(u.at)
      if (!Number.isNaN(at.getTime())) items.push({ at, text: u.text, by: u.by, tone: u.kind })
    }
    for (const t of venueTastings) {
      const vc = { yes: t.items.filter((i) => i.verdict === 'yes').length, no: t.items.filter((i) => i.verdict === 'no').length }
      items.push({
        at: t.scheduledAt ?? t.createdAt, tone: 'tasting', href: '/tastings',
        text: `Tasting · ${TASTING_STAGES.find((s) => s.value === t.stage)?.label} · ${t.items.length} drinks${vc.yes || vc.no ? ` · ${vc.yes} yes, ${vc.no} no` : ''}`,
      })
    }
    const firstRange = o.range[o.range.length - 1]
    for (const ord of o.since) {
      const rangeLines = ord.lineItems.filter((li) => rangeIds.has(li.productId))
      items.push({
        at: ord.createdAt, tone: 'order', href: `/orders/${ord.id}`,
        text: `${ord === firstRange ? '🎉 First range order · ' : 'Order '}${ord.orderNumber} · ${money(ord.subtotal)}${rangeLines.length ? ` · ${rangeLines.map((l) => l.productName).join(', ')}` : ' · no range drinks'}`,
      })
    }
    return items.sort((a, b) => b.at.getTime() - a.at.getTime())
  }, [v.updates, venueTastings, o, rangeIds])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'drinks', label: 'Drinks & prices', count: picked.length || undefined },
    { key: 'tastings', label: 'Tastings', count: venueTastings.length || undefined },
    { key: 'orders', label: 'Orders', count: o.since.length || undefined },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div>
      {booking && (
        <NewTastingModal
          accounts={accounts}
          products={products}
          recipes={recipes}
          ingredients={ingredients}
          staff={staff}
          presetAccountId={v.accountId}
          onClose={() => setBooking(false)}
          onSaved={async () => {
            if (stage === 'contact' || stage === 'not_started') await onPatch({ stage: 'tasting_booked' }, undefined, 'Tasting booked')
            onReload()
          }}
        />
      )}

      {/* ── header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: INK }}>{v.name}</h2>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: MUTED }}>
            {[v.group, account?.legalName, `in the rollout since ${format(v.startedAt, 'd MMM yyyy')}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>Close ✕</Button>
      </div>

      {/* ── the road ── */}
      <div style={{ ...card, marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: INK }}>
            {offRoad
              ? <span style={{ padding: '3px 10px', borderRadius: '20px', background: offRoad.bg, color: offRoad.fg }}>{offRoad.label}</span>
              : <>Step {idx + 1} of {ROLLOUT_STEPS.length} · {ROLLOUT_STEPS[idx]?.label}</>}
          </p>
          <span style={{ fontSize: '12px', color: SECONDARY }}>
            {offRoad
              ? <button onClick={() => onPatch({ stage: 'contact' }, undefined, 'Back in the rollout')} style={linkBtn}>Put back in the rollout</button>
              : <>
                  <button onClick={() => onPatch({ stage: 'paused' })} style={linkBtn}>Pause</button>
                  {' · '}
                  <button onClick={() => { if (confirm(`Mark ${v.name} as lost?`)) onPatch({ stage: 'lost' }) }} style={linkBtn}>Mark lost</button>
                </>}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ROLLOUT_STEPS.length}, minmax(0,1fr))`, opacity: offRoad ? 0.45 : 1 }}>
          {ROLLOUT_STEPS.map((s, i) => {
            const done = !offRoad && i < idx
            const here = !offRoad && i === idx
            return (
              <button
                key={s.value}
                disabled={s.auto}
                onClick={() => !s.auto && onPatch({ stage: s.value })}
                title={s.auto ? 'Moves on its own when orders arrive' : `Set to "${s.label}"`}
                style={{ border: 'none', background: 'none', padding: 0, cursor: s.auto ? 'default' : 'pointer', font: 'inherit', position: 'relative' }}
              >
                {i > 0 && (
                  <span style={{ position: 'absolute', top: '13px', right: '50%', width: '100%', height: '2px', background: done || here ? INK : '#e5e7eb' }} />
                )}
                <span style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px', borderRadius: '50%', fontSize: '12px', fontWeight: 700,
                  background: done ? INK : here ? '#fff' : '#f3f4f6',
                  color: done ? '#fff' : here ? INK : MUTED,
                  border: here ? `2px solid ${INK}` : '2px solid transparent',
                  boxShadow: '0 0 0 3px #fff',
                }}>{done ? '✓' : i + 1}</span>
                <span style={{ display: 'block', marginTop: '6px', fontSize: '11px', lineHeight: 1.25, color: here ? INK : done ? SECONDARY : MUTED, fontWeight: here ? 700 : 500 }}>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── do next ── */}
      {!offRoad && (
        <div style={{
          ...card, marginBottom: '14px',
          border: `1.5px solid ${attention ? '#fcd34d' : stage === 'recurring' ? '#bbf7d0' : '#e5e7eb'}`,
          background: attention ? '#fffbeb' : stage === 'recurring' ? '#f0fdf4' : '#fff',
        }}>
          <p style={kicker}>Do next{attention ? ` · ⚠ ${attention}` : ''}</p>
          {stage === 'recurring' ? (
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#166534' }}>
              🎉 Onboarded — {o.range.length} range orders since {format(v.startedAt, 'd MMM')}. Nothing to chase.
            </p>
          ) : (
            <>
              <input
                key={`next-${v.nextStep ?? ''}`}
                defaultValue={v.nextStep ?? ''}
                placeholder={ROLLOUT_STEPS[idx]?.doNext}
                onBlur={(e) => e.target.value.trim() !== (v.nextStep ?? '') && onPatch({ nextStep: e.target.value.trim() || undefined })}
                style={{ ...input, fontSize: '17px', fontWeight: 600, color: INK, border: '1px solid transparent', background: 'transparent', padding: '4px 0' }}
              />
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                {primary && <Button onClick={primary.run}>{primary.label}</Button>}
                {next && (
                  <Button variant="secondary" onClick={() => onPatch({ stage: next, nextStep: undefined, nextStepDue: undefined })}>
                    ✓ Done — go to &ldquo;{ROLLOUT_STEPS[stepIndex(next)].label}&rdquo;
                  </Button>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: SECONDARY, marginLeft: 'auto' }}>
                  By
                  <input
                    type="date"
                    value={v.nextStepDue ? format(v.nextStepDue, 'yyyy-MM-dd') : ''}
                    onChange={(e) => onPatch({ nextStepDue: e.target.value ? dayAt(e.target.value) : undefined })}
                    style={{ ...input, width: '150px', padding: '6px 8px', fontFamily: 'monospace', fontSize: '12.5px' }}
                  />
                  Owner
                  <select
                    value={v.owner ?? ''}
                    onChange={(e) => onPatch({ owner: e.target.value || undefined })}
                    style={{ ...input, width: '130px', padding: '6px 8px', fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    <option value="">—</option>
                    {staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
                  </select>
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── tabs ── */}
      <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content', marginBottom: '14px' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 15px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? INK : SECONDARY,
            boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>
            {t.label}{t.count ? <span style={{ marginLeft: '6px', color: MUTED, fontWeight: 500 }}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {/* ── overview ── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '14px' }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ ...kicker, margin: 0 }}>Who to talk to</p>
              {!newContact && <Button size="sm" variant="secondary" onClick={() => setNewContact({ id: newId(), name: '' })}>+ Add person</Button>}
            </div>
            {contacts.length === 0 && !newContact && (
              <p style={{ margin: 0, fontSize: '13px', color: '#b45309' }}>Nobody yet. Add the person who says yes to drinks and prices.</p>
            )}
            {contacts.map((c) => (
              <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid #f9fafb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: INK }}>{c.name}</span>
                  {c.role && <span style={{ fontSize: '12px', color: MUTED }}>{c.role}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {([['decides', 'Decides'], ['orders', 'Places orders']] as const).map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => saveContact({ ...c, [k]: !c[k] })}
                        style={{
                          border: `1px solid ${c[k] ? '#bbf7d0' : '#e5e7eb'}`, background: c[k] ? '#dcfce7' : '#fff',
                          color: c[k] ? '#166534' : MUTED, borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        }}
                      >{c[k] ? '✓ ' : ''}{l}</button>
                    ))}
                    <button onClick={() => setNewContact(c)} style={linkBtn}>Edit</button>
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: SECONDARY }}>
                  {c.email && <a href={`mailto:${c.email}`} style={{ color: '#1d4ed8' }}>{c.email}</a>}
                  {c.email && c.phone && ' · '}
                  {c.phone && <a href={`tel:${c.phone}`} style={{ color: '#1d4ed8' }}>{c.phone}</a>}
                </p>
              </div>
            ))}
            {newContact && (
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px', marginTop: '6px', display: 'grid', gap: '8px' }}>
                <input autoFocus value={newContact.name} placeholder="Name" onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} style={input} />
                <input value={newContact.role ?? ''} placeholder="Role — bar manager, GM, owner…" onChange={(e) => setNewContact({ ...newContact, role: e.target.value || undefined })} style={input} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input value={newContact.email ?? ''} placeholder="Email" onChange={(e) => setNewContact({ ...newContact, email: e.target.value || undefined })} style={input} />
                  <input value={newContact.phone ?? ''} placeholder="Phone" onChange={(e) => setNewContact({ ...newContact, phone: e.target.value || undefined })} style={input} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                  {contacts.some((x) => x.id === newContact.id)
                    ? <button onClick={async () => {
                        if (!confirm(`Remove ${newContact.name}?`)) return
                        await onPatch({ contacts: contacts.filter((x) => x.id !== newContact.id) }, undefined, `Contact removed: ${newContact.name}`)
                        setNewContact(null)
                      }} style={{ ...linkBtn, color: '#dc2626' }}>Remove</button>
                    : <span />}
                  <span style={{ display: 'flex', gap: '8px' }}>
                    <Button size="sm" variant="ghost" onClick={() => setNewContact(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => saveContact(newContact)}>Save person</Button>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={card}>
            <p style={kicker}>Write down what happened</p>
            <form
              onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await onPatch({}, note); setNote('') }}
              style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}
            >
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called Ruhit, wants the Negroni less bitter…" style={input} />
              <Button type="submit" disabled={!note.trim()}>Save</Button>
            </form>
            <p style={{ ...kicker, marginTop: '4px' }}>What is stopping it</p>
            <input
              key={`blocker-${v.blocker ?? ''}`}
              defaultValue={v.blocker ?? ''}
              placeholder="Nothing"
              onBlur={(e) => e.target.value.trim() !== (v.blocker ?? '') && onPatch({ blocker: e.target.value.trim() || undefined })}
              style={{ ...input, color: v.blocker ? '#b91c1c' : undefined, marginBottom: '14px' }}
            />
            <p style={kicker}>Latest</p>
            {timeline.slice(0, 6).map((t, i) => <TimelineRow key={i} item={t} />)}
            {timeline.length > 6 && <button onClick={() => setTab('timeline')} style={linkBtn}>See everything →</button>}
          </div>
        </div>
      )}

      {/* ── drinks & prices ── */}
      {tab === 'drinks' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: '1px solid #f3f4f6' }}>
            {DEV_VARIANTS.map((vt) => {
              const on = drinkFormat === vt.value
              const c = formatCount(vt.value as DevVariant)
              return (
                <button
                  key={vt.value}
                  onClick={() => { setDrinkFormat(vt.value as DevVariant); setDrinkFilter('all') }}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer', font: 'inherit',
                    padding: '8px 14px 10px', marginBottom: '-1px',
                    borderBottom: `2.5px solid ${on ? INK : 'transparent'}`,
                    fontSize: '14.5px', fontWeight: 700, color: on ? INK : MUTED,
                  }}
                >
                  {vt.short}
                  <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 500, color: MUTED }}>
                    {c.picked} wanted · {c.agreed} agreed
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: INK }}>
              <strong>{fc.picked}</strong> they want · <strong>{fc.priced}</strong> priced · <strong>{fc.agreed}</strong> agreed
            </p>
            <div style={{ display: 'flex', gap: '4px' }}>
              {([['all', `All ${formatRows.length}`], ['picked', `They want ${fc.picked}`], ['agreed', `Agreed ${fc.agreed}`]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setDrinkFilter(k)} style={{
                  border: 'none', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  background: drinkFilter === k ? INK : '#f3f4f6', color: drinkFilter === k ? '#fff' : SECONDARY,
                }}>{l}</button>
              ))}
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: MUTED }}>
            Tap what they said for each drink. Put in the price per litre — the margin works itself out. Tick Agreed when they say yes.{' '}
            {drinkFormat === 'premix'
              ? 'Agreed prices here go straight onto their price list.'
              : 'No-spirit prices are costed without the spirit, and stay on this page — their price list holds one price per drink.'}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Drink', 'What they said', 'Costs us / L', 'Our price / L', 'Our margin', 'Agreed'].map((h, i) => (
                    <th key={h} style={{ ...kicker, padding: '6px 8px', textAlign: i >= 2 ? 'right' : 'left', margin: 0 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r) => {
                  const price = r.pick?.pricePerLitre
                  const gp = price && r.cost ? ((price - r.cost) / price) * 100 : null
                  const label = `${drinkName(r.p)} (${r.short})`
                  return (
                    <tr key={`${r.p.id}-${r.variant}`} style={{ borderTop: '1px solid #f9fafb', background: r.pick?.agreed ? '#f7fdf9' : undefined }}>
                      <td style={{ padding: '8px' }}>
                        <span style={{ fontWeight: 700, color: INK }}>{drinkName(r.p)}</span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {RANGE_STATUSES.map((s) => {
                            const on = r.status === s.value
                            return (
                              <button
                                key={s.value}
                                onClick={() => setPick(r.p, r.variant, { status: on ? undefined : s.value as RangeStatus }, on ? `${label}: status cleared` : `${label}: ${s.label}`)}
                                style={{
                                  border: `1px solid ${on ? s.fg : '#e5e7eb'}`, background: on ? s.bg : '#fff',
                                  color: on ? s.fg : MUTED, borderRadius: '20px', padding: '2px 8px',
                                  fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                }}
                              >{s.label}</button>
                            )
                          })}
                          {r.fromTasting && <span style={{ fontSize: '10.5px', color: MUTED, marginLeft: '3px' }}>from tasting</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: r.cost ? SECONDARY : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                        {r.cost ? money(r.cost) : 'no recipe'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <input
                          key={`price-${r.p.id}-${r.variant}-${price ?? ''}`}
                          defaultValue={price ?? ''}
                          inputMode="decimal"
                          placeholder={r.onList ? r.onList.pricePerLitre.toFixed(2) : '£'}
                          title={r.onList ? `On their price list now: ${money(r.onList.pricePerLitre)}/L` : undefined}
                          onBlur={(e) => {
                            const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                            const val = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined
                            if (val === price) return
                            setPick(r.p, r.variant, { pricePerLitre: val, ...(val === undefined ? { agreed: false } : {}) },
                              val ? `${label}: price ${money(val)}/L` : `${label}: price cleared`)
                          }}
                          style={{ ...input, width: '90px', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}
                        />
                      </td>
                      <td style={{
                        padding: '8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: gp === null ? '#d1d5db' : gp < 30 ? '#b91c1c' : gp < 50 ? '#b45309' : '#166534',
                      }}>
                        {gp === null ? '—' : `${gp.toFixed(0)}%`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <button
                          onClick={() => agree(r, !r.pick?.agreed)}
                          style={{
                            border: `1px solid ${r.pick?.agreed ? '#bbf7d0' : '#e5e7eb'}`,
                            background: r.pick?.agreed ? '#dcfce7' : '#fff',
                            color: r.pick?.agreed ? '#166534' : MUTED,
                            borderRadius: '20px', padding: '3px 11px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >{r.pick?.agreed ? '✓ Agreed' : 'Agree'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {classics.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: '#b45309' }}>No core range drinks yet — set the range up on Product development.</p>}
        </div>
      )}

      {/* ── tastings ── */}
      {tab === 'tastings' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <p style={{ ...kicker, margin: 0 }}>{venueTastings.length} tasting{venueTastings.length === 1 ? '' : 's'}</p>
            <Button onClick={() => setBooking(true)}>Book a tasting</Button>
          </div>
          {venueTastings.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>None yet. Book one and it shows here and on the Tastings calendar.</p>}
          {venueTastings.map((t) => {
            const sc = TASTING_STAGES.find((s) => s.value === t.stage) ?? TASTING_STAGES[0]
            return (
              <div key={t.id} style={{ padding: '12px 0', borderTop: '1px solid #f9fafb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: INK }}>{t.scheduledAt ? format(t.scheduledAt, 'EEE d MMM yyyy') : 'No date yet'}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: sc.bg, color: sc.fg }}>{sc.label}</span>
                  {t.owner && <span style={{ fontSize: '12px', color: MUTED }}>{t.owner}</span>}
                  <Link href="/tastings" style={{ marginLeft: 'auto', fontSize: '12.5px', color: '#1d4ed8' }}>Open on Tastings →</Link>
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {t.items.map((it, i) => {
                    const vc = TASTING_VERDICTS.find((x) => x.value === it.verdict) ?? TASTING_VERDICTS[0]
                    return (
                      <span key={i} style={{ fontSize: '11.5px', padding: '3px 9px', borderRadius: '20px', background: it.verdict === 'pending' ? '#f9fafb' : vc.bg, color: it.verdict === 'pending' ? SECONDARY : vc.fg, fontWeight: 600 }}>
                        {it.productName} · {DEV_VARIANTS.find((x) => x.value === it.variant)?.short}{it.verdict !== 'pending' ? ` · ${vc.label}` : ''}
                      </span>
                    )
                  })}
                </div>
                {t.notes && <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: SECONDARY, whiteSpace: 'pre-wrap' }}>{t.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── orders ── */}
      {tab === 'orders' && (
        <div style={{ display: 'grid', gap: '14px' }}>
          <div style={{ ...card, border: `1.5px solid ${o.recurring ? '#bbf7d0' : '#e5e7eb'}` }}>
            <p style={kicker}>Onboarding counter</p>
            <p style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: o.recurring ? '#166534' : INK }}>
              {o.recurring
                ? `🎉 Onboarded — ${RECURRING_ORDERS} range orders inside ${RECURRING_WINDOW_DAYS / 7} weeks`
                : `${o.inWindow} of ${RECURRING_ORDERS} range orders in the last ${RECURRING_WINDOW_DAYS / 7} weeks`}
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {Array.from({ length: RECURRING_ORDERS }, (_, i) => (
                <span key={i} style={{ flex: 1, height: '8px', borderRadius: '99px', background: o.recurring || i < o.inWindow ? '#16a34a' : '#f3f4f6' }} />
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: MUTED }}>
              Counts orders since {format(v.startedAt, 'd MMM yyyy')} that include at least one core range drink.
            </p>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <p style={{ ...kicker, margin: 0 }}>{olderOrders ? `All ${o.all.length} orders` : `${o.since.length} orders since the rollout began`}</p>
              {o.all.length > o.since.length && (
                <button onClick={() => setOlderOrders((x) => !x)} style={linkBtn}>
                  {olderOrders ? 'Only since the rollout' : `Show ${o.all.length - o.since.length} older`}
                </button>
              )}
            </div>
            {(olderOrders ? o.all : o.since).length === 0 && (
              <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>No orders yet. They show up here the moment one comes in.</p>
            )}
            {(olderOrders ? o.all : o.since).map((ord) => {
              const before = ord.createdAt < v.startedAt
              const rangeLines = ord.lineItems.filter((li) => rangeIds.has(li.productId))
              const otherLines = ord.lineItems.filter((li) => !rangeIds.has(li.productId))
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
                    {rangeLines.map((li, i) => (
                      <span key={`r${i}`} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#dcfce7', color: '#166534' }}>
                        ★ {li.quantity}× {li.productName}
                      </span>
                    ))}
                    {otherLines.map((li, i) => (
                      <span key={`o${i}`} style={{ fontSize: '11.5px', padding: '3px 9px', borderRadius: '20px', background: '#f3f4f6', color: SECONDARY }}>
                        {li.quantity}× {li.productName}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: MUTED }}>★ green = core range drink · grey = their other drinks</p>
          </div>
        </div>
      )}

      {/* ── timeline ── */}
      {tab === 'timeline' && (
        <div style={card}>
          <p style={kicker}>Everything, newest first</p>
          {timeline.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>Nothing yet.</p>}
          {timeline.map((t, i) => <TimelineRow key={i} item={t} />)}
        </div>
      )}

      <div style={{ marginTop: '22px', paddingTop: '14px', borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={async () => {
            if (!confirm(`Remove ${v.name} from the rollout?\n\nIts contacts, drink picks and notes on this board are deleted. The account, its orders and its price list are not touched.`)) return
            await onRemove()
          }}
          style={{ ...linkBtn, color: '#dc2626' }}
        >
          Remove {v.name} from the rollout
        </button>
      </div>
    </div>
  )
}

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
  fontSize: '12.5px', color: SECONDARY, textDecoration: 'underline',
}

function TimelineRow({ item }: { item: { at: Date; text: string; by?: string; tone: 'note' | 'auto' | 'order' | 'tasting'; href?: string } }) {
  const dot = item.tone === 'note' ? INK : item.tone === 'order' ? '#16a34a' : item.tone === 'tasting' ? '#2a78d6' : '#d1d5db'
  const body = (
    <span style={{ fontSize: '13px', color: item.tone === 'auto' ? SECONDARY : INK, lineHeight: 1.45 }}>
      {item.tone === 'note' && <strong>Note: </strong>}{item.text}
    </span>
  )
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '8px 0', borderTop: '1px solid #fafafa' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, marginTop: '6px', flex: 'none' }} />
      <div style={{ minWidth: 0 }}>
        {item.href ? <Link href={item.href} style={{ textDecoration: 'none' }}>{body}</Link> : body}
        <p style={{ margin: '2px 0 0', fontSize: '11px', color: MUTED }}>
          {format(item.at, 'EEE d MMM yyyy, HH:mm')}{item.by ? ` · ${item.by}` : ''}
        </p>
      </div>
    </div>
  )
}
