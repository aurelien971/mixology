'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getRollouts, createRollout } from '@/lib/firestore/rollouts'
import { getAccounts } from '@/lib/firestore/accounts'
import { getAllMenuDrinks, setUpSpringStreetBar, setUpPyroAutumnMenu } from '@/lib/firestore/menu'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getAllOrders } from '@/lib/firestore/orders'
import { venueOrders, effectiveStage, stepIndex, needsAttention, mainContact, contactFromAccount } from '@/lib/rollout'
import { drinkState, readiness, Readiness, DEFAULT_GP_TARGET } from '@/lib/onboarding'
import {
  Account, Ingredient, MenuDrink, Order, Product, Recipe, RolloutStage, RolloutVenue, ROLLOUT_STEPS, ROLLOUT_OFF_ROAD,
} from '@/types'
import toast from 'react-hot-toast'

/**
 * Every venue we are onboarding, one row each: the tasting, their menu, the
 * recipes still missing, whether we can guarantee their GP, and what is signed
 * off. Click a venue for everything else.
 */

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'

type Filter = 'all' | 'attention' | 'recipes' | 'soon' | 'onboarded'

interface Row {
  v: RolloutVenue
  stage: RolloutStage
  idx: number
  attention: string | null
  rd: Readiness
  days: number | null
  ours: number
  made: number
  isNew: boolean
  contact?: string
}

const COLS = 'minmax(190px,1.3fr) 118px minmax(130px,0.9fr) 120px 110px minmax(150px,1fr) minmax(210px,1.5fr)'

export default function OnboardingPage() {
  const [venues, setVenues] = useState<RolloutVenue[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [drinks, setDrinks] = useState<MenuDrink[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState('')
  const started = useRef(false)

  async function load() {
    const [v, a, d, p, r, i, o] = await Promise.all([getRollouts(), getAccounts(), getAllMenuDrinks(), getProducts(), getRecipes(), getIngredients(), getAllOrders()])
    setVenues(v); setAccounts(a); setDrinks(d); setProducts(p); setRecipes(r); setIngredients(i); setOrders(o)
    setLoading(false)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        if (await setUpSpringStreetBar()) toast.success('Spring Street Bar added with the menu Tom sent')
        if (await setUpPyroAutumnMenu()) toast.success("Pyro's autumn/winter brief added")
      } catch (e) {
        console.error(e)
      }
      await load()
    })()
  }, [])

  const classicIds = new Set(products.filter((p) => p.isClassic && p.isActive !== false).map((p) => p.id))
  const today = startOfDay(new Date())

  const rows: Row[] = venues
    .filter((v) => !accounts.length || accounts.some((a) => a.id === v.accountId))
    .map((v) => {
      const menu = drinks.filter((d) => d.venueId === v.id)
      const states = new Map(menu.map((d) => [d.id, drinkState(d, v, products, recipes, ingredients)]))
      const ids = new Set(classicIds)
      for (const s of states.values()) if (s.own) ids.add(s.own.id)
      const o = venueOrders(v, orders, ids)
      const stage = effectiveStage(v, o)
      const rd = readiness(v, menu, states)
      const days = v.tastingDate ? differenceInCalendarDays(new Date(v.tastingDate + 'T12:00:00'), today) : null
      let attention = needsAttention(v, stage, o)
      if (!attention && days !== null && days >= 0 && days <= 7 && !rd.allGood) attention = `Tasting in ${days}d — not ready`
      const active = menu.filter((d) => d.stage !== 'dropped')
      return {
        v, stage, idx: stepIndex(stage), attention, rd, days,
        ours: active.filter((d) => d.overlap === 'same').length,
        made: active.filter((d) => d.overlap !== 'same').length,
        isNew: o.isNew,
        contact: mainContact(v)?.name,
      }
    })

  const counts = {
    all: rows.length,
    attention: rows.filter((r) => r.attention).length,
    recipes: rows.reduce((s, r) => s + r.rd.recipesMissing, 0),
    soon: rows.filter((r) => r.days !== null && r.days >= 0 && r.days <= 7).length,
    onboarded: rows.filter((r) => r.stage === 'recurring').length,
    fresh: rows.filter((r) => r.isNew).length,
  }

  const visible = rows
    .filter((r) =>
      filter === 'all' ? true
      : filter === 'attention' ? !!r.attention
      : filter === 'recipes' ? r.rd.recipesMissing > 0
      : filter === 'soon' ? r.days !== null && r.days >= 0 && r.days <= 7
      : r.stage === 'recurring'
    )
    .sort((a, b) =>
      Number(!!b.attention) - Number(!!a.attention) ||
      (a.days !== null && a.days >= 0 ? a.days : 999) - (b.days !== null && b.days >= 0 ? b.days : 999) ||
      a.v.name.localeCompare(b.v.name)
    )

  const groups: { name: string | null; rows: Row[] }[] = []
  const solo = visible.filter((r) => !r.v.group)
  if (solo.length) groups.push({ name: null, rows: solo })
  for (const g of [...new Set(visible.map((r) => r.v.group).filter((x): x is string => !!x))].sort()) {
    groups.push({ name: g, rows: visible.filter((r) => r.v.group === g) })
  }

  async function addVenue() {
    const acc = accounts.find((a) => a.id === adding)
    if (!acc) return
    if (venues.some((x) => x.accountId === acc.id)) return toast.error('Already in onboarding')
    const now = new Date()
    const contact = contactFromAccount(acc)
    await createRollout({
      accountId: acc.id, name: acc.tradingName || acc.legalName, stage: 'not_started',
      contacts: contact ? [contact] : [], range: [], startedAt: now,
      updates: [{ at: now.toISOString(), text: 'Added to onboarding', kind: 'auto' }],
    })
    setAdding('')
    toast.success(`${acc.tradingName || acc.legalName} added — drop their brief next`)
    await load()
  }

  const onBoard = new Set(venues.map((x) => x.accountId))

  return (
    <div>
      <Header title="Onboarding" subtitle="Every venue we are bringing on: their menu, what we make, their GP, tastings and sign-off — until they reorder on their own." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        {([
          { key: 'all', label: 'Venues', value: `${counts.all}`, sub: counts.fresh ? `${counts.fresh} new order${counts.fresh === 1 ? '' : 's'}` : 'in onboarding' },
          { key: 'attention', label: 'Need you', value: `${counts.attention}`, sub: 'late, quiet, or tasting close and not ready', warn: counts.attention > 0 },
          { key: 'recipes', label: 'Recipes missing', value: `${counts.recipes}`, sub: 'across every menu', warn: counts.recipes > 0 },
          { key: 'soon', label: 'Tastings this week', value: `${counts.soon}`, sub: 'in the next 7 days' },
          { key: 'onboarded', label: 'Onboarded', value: `${counts.onboarded} of ${counts.all}`, sub: 'reorder on their own', good: counts.onboarded > 0 },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setFilter(t.key)} style={{
            textAlign: 'left', cursor: 'pointer', font: 'inherit', borderRadius: '12px', padding: '14px 16px', background: '#fff',
            border: `1.5px solid ${filter === t.key ? INK : '#f3f4f6'}`,
          }}>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</span>
            <span style={{ display: 'block', fontSize: '26px', fontWeight: 600, marginTop: '2px', color: 'warn' in t && t.warn ? '#b45309' : 'good' in t && t.good ? '#166534' : INK }}>{t.value}</span>
            <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>{t.sub}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: '13px', color: MUTED }}>Loading the venues…</p>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.name ?? 'solo'} style={{ marginBottom: '18px' }}>
              {g.name && (
                <p style={{ margin: '0 0 8px 2px', fontSize: '12px', fontWeight: 700, color: SECONDARY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {g.name} · {g.rows.length} sites
                </p>
              )}
              <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflowX: 'auto' }}>
                <div style={{ minWidth: '1080px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '14px', padding: '9px 18px', background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                    {['Venue', 'Tasting', 'Menu', 'Recipes', 'GP check', 'Signed off', 'Do next'].map((h) => (
                      <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {g.rows.map((r) => <VenueRow key={r.v.id} r={r} />)}
                </div>
              </div>
            </div>
          ))}

          {visible.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '14px', color: filter === 'attention' ? '#166534' : MUTED }}>{filter === 'attention' ? '✓ Nothing needs you right now.' : 'No venues here.'}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
            <select value={adding} onChange={(e) => setAdding(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff' }}>
              <option value="">Add a venue…</option>
              {accounts.filter((a) => !onBoard.has(a.id) && a.businessLine !== 'baek').map((a) => (
                <option key={a.id} value={a.id}>{a.tradingName || a.legalName}</option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={addVenue} disabled={!adding}>Add</Button>
          </div>
        </>
      )}
    </div>
  )
}

function VenueRow({ r }: { r: Row }) {
  const { v, rd } = r
  const off = ROLLOUT_OFF_ROAD.find((s) => s.value === r.stage)
  const target = v.gpTarget ?? DEFAULT_GP_TARGET
  return (
    <Link href={`/onboarding/${v.id}`} style={{
      display: 'grid', gridTemplateColumns: COLS, gap: '14px', alignItems: 'center', padding: '14px 18px',
      borderBottom: '1px solid #f9fafb', textDecoration: 'none', background: r.attention ? '#fffdf5' : '#fff',
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
          {r.isNew && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '20px', background: '#dbeafe', color: '#1d4ed8', flex: 'none' }}>NEW ORDER</span>}
        </span>
        {r.attention
          ? <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#b45309', marginTop: '2px' }}>⚠ {r.attention}</span>
          : off
            ? <span style={{ display: 'block', fontSize: '12px', color: off.fg, marginTop: '2px' }}>{off.label}</span>
            : <span style={{ display: 'block', fontSize: '12px', color: MUTED, marginTop: '2px' }}>{ROLLOUT_STEPS[r.idx]?.label ?? '—'}{r.contact ? ` · ${r.contact}` : ''}</span>}
      </span>

      <span style={{ fontSize: '13px', color: r.days === null ? MUTED : INK }}>
        {r.days === null ? 'no date' : format(new Date(v.tastingDate + 'T12:00:00'), 'EEE d MMM')}
        {r.days !== null && (
          <span style={{ display: 'block', fontSize: '11.5px', fontWeight: r.days >= 0 && r.days <= 7 ? 700 : 400, color: r.days < 0 ? MUTED : r.days <= 7 ? '#b91c1c' : MUTED }}>
            {r.days > 0 ? `in ${r.days} days` : r.days === 0 ? 'today' : 'done'}
          </span>
        )}
      </span>

      <span style={{ fontSize: '13px', color: rd.active ? INK : MUTED }}>
        {rd.active ? <><strong>{rd.active}</strong> drinks</> : 'no menu yet'}
        {rd.active > 0 && <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>{r.ours} ours · {r.made} we make</span>}
      </span>

      <span style={{ fontSize: '13px', fontWeight: 600, color: !rd.active ? MUTED : rd.recipesMissing ? '#b91c1c' : '#166534' }}>
        {!rd.active ? '—' : rd.recipesMissing ? `${rd.recipesMissing} missing` : '✓ all written'}
      </span>

      <span style={{ fontSize: '13px', fontWeight: 600, color: !rd.active ? MUTED : rd.gpPass === rd.active ? '#166534' : '#b45309' }}>
        {!rd.active ? '—' : `${rd.gpPass}/${rd.active} at ${target}%`}
      </span>

      <span>
        <span style={{ fontSize: '13px', color: rd.active ? INK : MUTED }}>{rd.active ? `${rd.signed} of ${rd.active}` : '—'}</span>
        {rd.active > 0 && (
          <span style={{ display: 'block', height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginTop: '5px' }}>
            <span style={{ display: 'block', width: `${rd.pct}%`, height: '100%', background: rd.allGood ? '#16a34a' : INK }} />
          </span>
        )}
      </span>

      <span style={{ minWidth: 0, fontSize: '13px', color: v.nextStep ? INK : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {v.nextStep ?? (!rd.active ? 'Drop their brief' : rd.recipesMissing ? 'Write the missing recipes' : rd.gpPass < rd.active ? 'Set prices that keep their GP' : rd.signed < rd.active ? 'Taste and sign off' : ROLLOUT_STEPS[r.idx]?.doNext ?? '—')}
        <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>{v.owner ?? ''}</span>
      </span>
    </Link>
  )
}
