'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import VenuePanel from '@/components/rollout/VenuePanel'
import { getRollouts, createRollout, updateRolloutLogged, deleteRollout } from '@/lib/firestore/rollouts'
import { getAccounts, createAccount } from '@/lib/firestore/accounts'
import { getProducts, getAllPricing } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getAllOrders } from '@/lib/firestore/orders'
import { getTastings } from '@/lib/firestore/tastings'
import { getStaffUsers, StaffUser } from '@/lib/firestore/staffUsers'
import {
  ROLLOUT_SEED, findSeedAccount, contactFromAccount, venueOrders, effectiveStage, stepIndex,
  needsAttention, mainContact, VenueOrders,
} from '@/lib/rollout'
import {
  Account, AccountPricing, Ingredient, Order, Product, Recipe, RolloutVenue, RolloutStage, TastingSession,
  ROLLOUT_STEPS, ROLLOUT_OFF_ROAD,
} from '@/types'
import toast from 'react-hot-toast'

/**
 * The rollout board: every venue we are moving onto the core range, one row
 * each, with the step it is on and the one thing to do next. Click a row and
 * everything about that venue opens over the board.
 */

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'

type Filter = 'all' | 'attention' | 'ordering' | 'onboarded'

interface Row {
  v: RolloutVenue
  o: VenueOrders
  stage: RolloutStage
  idx: number
  attention: string | null
  picked: number
  agreed: number
}

export default function RolloutPage() {
  const [venues, setVenues] = useState<RolloutVenue[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tastings, setTastings] = useState<TastingSession[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState('')
  const firstLoad = useRef(true)
  const seeded = useRef(false)

  function load() {
    return Promise.all([
      getRollouts(), getAccounts(), getProducts(), getRecipes(), getIngredients(),
      getAllOrders(), getTastings(), getAllPricing(), getStaffUsers(),
    ]).then(([r, a, p, rc, i, o, t, pr, s]) => {
      setVenues(r); setAccounts(a); setProducts(p); setRecipes(rc); setIngredients(i)
      setOrders(o); setTastings(t); setPricing(pr); setStaff(s)
      // Arriving from the Activity log with ?venue= opens that venue.
      if (firstLoad.current) {
        firstLoad.current = false
        const want = new URLSearchParams(window.location.search).get('venue')
        if (want && r.some((x) => x.id === want)) setOpenId(want)
      }
    }).finally(() => setLoading(false))
  }

  // The nine venues are put on the board the first time it opens. Everything is
  // re-read at the moment of writing and matched on the account, so opening
  // the page twice — or two people at once — cannot create a second copy.
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    ;(async () => {
      try {
        let [existing, accs] = await Promise.all([getRollouts(), getAccounts()])
        // Setup is a one-off for an empty board. Once venues exist it never runs
        // again, so a venue someone removed stays removed.
        if (existing.length > 0) return
        const now = new Date()
        for (const seed of ROLLOUT_SEED) {
          let account = findSeedAccount(seed, accs)
          if (!account && seed.createIfMissing) {
            const id = await createAccount({
              legalName: seed.name, tradingName: seed.name, type: 'external', email: '',
              address: { line1: '', city: 'London', postcode: '' }, paymentTerms: 'net_30', businessLine: 'cocktail',
              notes: 'Created for the core range rollout — fill in the legal name, address and email.',
            })
            accs = await getAccounts()
            account = accs.find((a) => a.id === id)
            toast.success(`${seed.name} account created`)
          }
          if (!account) continue
          const acc = account
          if (existing.some((x) => x.accountId === acc.id)) continue
          const contact = contactFromAccount(acc)
          await createRollout({
            accountId: acc.id,
            name: seed.name,
            group: seed.group,
            stage: 'not_started',
            contacts: contact ? [contact] : [],
            range: [],
            startedAt: now,
            updates: [{ at: now.toISOString(), text: 'Added to the rollout', kind: 'auto' }],
          })
          existing = await getRollouts()
        }
      } catch (e) {
        console.error(e)
        toast.error('Could not set up every venue — refresh to try again')
      } finally {
        load()
      }
    })()
  }, [])

  const rangeIds = useMemo(
    () => new Set(products.filter((p) => p.isActive !== false && p.isClassic).map((p) => p.id)),
    [products]
  )

  // A venue whose account has been deleted has nothing left to track.
  const rows = useMemo<Row[]>(() => venues.filter((v) => !accounts.length || accounts.some((a) => a.id === v.accountId)).map((v) => {
    const o = venueOrders(v, orders, rangeIds)
    const stage = effectiveStage(v, o)
    const range = v.range ?? []
    return {
      v, o, stage, idx: stepIndex(stage), attention: needsAttention(v, stage, o),
      picked: range.filter((r) => r.status === 'yes' || r.status === 'maybe').length,
      agreed: range.filter((r) => r.agreed).length,
    }
  }), [venues, orders, rangeIds, accounts])

  const counts = {
    all: rows.length,
    attention: rows.filter((r) => r.attention).length,
    ordering: rows.filter((r) => r.stage === 'first_order').length,
    onboarded: rows.filter((r) => r.stage === 'recurring').length,
    fresh: rows.filter((r) => r.o.isNew).length,
  }

  const visible = rows
    .filter((r) =>
      filter === 'all' ? true
      : filter === 'attention' ? !!r.attention
      : filter === 'ordering' ? r.stage === 'first_order'
      : r.stage === 'recurring'
    )
    // Needs attention first, then furthest behind, so the top of the list is
    // always where the work is.
    .sort((a, b) =>
      Number(!!b.attention) - Number(!!a.attention) ||
      Number(b.o.isNew) - Number(a.o.isNew) ||
      (a.idx < 0 ? 99 : a.idx) - (b.idx < 0 ? 99 : b.idx) ||
      a.v.name.localeCompare(b.v.name)
    )

  // Venues on their own first; a group's sites together under its name.
  const groups = useMemo(() => {
    const out: { name: string | null; rows: Row[] }[] = []
    const solo = visible.filter((r) => !r.v.group)
    if (solo.length) out.push({ name: null, rows: solo })
    for (const g of [...new Set(visible.map((r) => r.v.group).filter((x): x is string => !!x))].sort()) {
      out.push({ name: g, rows: visible.filter((r) => r.v.group === g) })
    }
    return out
  }, [visible])

  async function patch(v: RolloutVenue, data: Partial<RolloutVenue>, note?: string, auto?: string) {
    setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...data, updatedAt: new Date() } : x)))
    try {
      const updates = await updateRolloutLogged(v, data, note, auto)
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, updates } : x)))
    } catch (e) {
      console.error(e)
      toast.error('Did not save — try again')
      load()
    }
  }

  async function addVenue() {
    const acc = accounts.find((a) => a.id === adding)
    if (!acc) return
    if (venues.some((x) => x.accountId === acc.id)) return toast.error('Already on the board')
    const contact = contactFromAccount(acc)
    const now = new Date()
    await createRollout({
      accountId: acc.id, name: acc.tradingName || acc.legalName, group: acc.groupName && acc.groupName !== 'Culinary Collective' ? acc.groupName : undefined,
      stage: 'not_started', contacts: contact ? [contact] : [], range: [], startedAt: now,
      updates: [{ at: now.toISOString(), text: 'Added to the rollout', kind: 'auto' }],
    })
    setAdding('')
    toast.success(`${acc.tradingName || acc.legalName} added`)
    load()
  }

  const open = venues.find((x) => x.id === openId)
  const onBoard = new Set(venues.map((x) => x.accountId))

  return (
    <div>
      {open && (
        <div
          onClick={() => setOpenId(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px', overflowY: 'auto',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#f9fafb', borderRadius: '14px', width: '100%', maxWidth: '1120px', padding: '22px 24px 26px' }}>
            <VenuePanel
              key={open.id}
              venue={open}
              account={accounts.find((a) => a.id === open.accountId)}
              accounts={accounts}
              products={products}
              recipes={recipes}
              ingredients={ingredients}
              orders={orders}
              tastings={tastings}
              pricing={pricing}
              staff={staff}
              onPatch={(data, note, auto) => patch(open, data, note, auto)}
              onReload={load}
              onClose={() => setOpenId(null)}
              onRemove={async () => {
                await deleteRollout(open.id)
                setVenues((prev) => prev.filter((x) => x.id !== open.id))
                setOpenId(null)
                toast.success(`${open.name} removed from the rollout`)
              }}
            />
          </div>
        </div>
      )}

      <Header
        title="Rollout"
        subtitle="Getting each venue onto the core range. One row per venue — click it to open everything."
      />

      {/* four numbers, each one a filter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        {([
          { key: 'all', label: 'Venues', value: `${counts.all}`, sub: counts.fresh ? `${counts.fresh} new order${counts.fresh === 1 ? '' : 's'}` : 'in the rollout' },
          { key: 'attention', label: 'Need you', value: `${counts.attention}`, sub: 'late, quiet or no next step', warn: counts.attention > 0 },
          { key: 'ordering', label: 'Ordering the range', value: `${counts.ordering}`, sub: 'working towards 3 in 6 weeks' },
          { key: 'onboarded', label: 'Onboarded', value: `${counts.onboarded} of ${counts.all}`, sub: 'reorder on their own', good: counts.onboarded > 0 },
        ] as const).map((t) => {
          const on = filter === t.key
          return (
            <button key={t.key} onClick={() => setFilter(t.key)} style={{
              textAlign: 'left', cursor: 'pointer', font: 'inherit', borderRadius: '12px', padding: '14px 16px',
              background: '#fff', border: `1.5px solid ${on ? INK : '#f3f4f6'}`,
            }}>
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: '26px', fontWeight: 600, marginTop: '2px', color: 'warn' in t && t.warn ? '#b45309' : 'good' in t && t.good ? '#166534' : INK }}>{t.value}</span>
              <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>{t.sub}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p style={{ fontSize: '13px', color: MUTED }}>Setting up the board…</p>
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
                <div style={{ minWidth: '1040px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '14px', padding: '9px 18px', background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                    {['Venue', 'Where they are', 'Do next', 'Talk to', 'Drinks', 'Last order'].map((h) => (
                      <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {g.rows.map((r) => <VenueRow key={r.v.id} row={r} onOpen={() => setOpenId(r.v.id)} />)}
                </div>
              </div>
            </div>
          ))}

          {visible.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '14px', color: filter === 'attention' ? '#166534' : MUTED }}>
                {filter === 'attention' ? '✓ Nothing needs you right now.' : 'No venues here yet.'}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
            <select value={adding} onChange={(e) => setAdding(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff' }}>
              <option value="">Add another venue…</option>
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

const COLS = 'minmax(170px,1.2fr) minmax(210px,1.4fr) minmax(220px,1.6fr) minmax(120px,0.9fr) minmax(110px,0.8fr) minmax(140px,1fr)'

function VenueRow({ row: r, onOpen }: { row: Row; onOpen: () => void }) {
  const { v, o, stage, idx, attention } = r
  const off = ROLLOUT_OFF_ROAD.find((s) => s.value === stage)
  const contact = mainContact(v)
  const late = v.nextStepDue ? differenceInCalendarDays(startOfDay(new Date()), v.nextStepDue) : null

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: COLS, gap: '14px', alignItems: 'center', width: '100%',
        padding: '14px 18px', border: 'none', borderBottom: '1px solid #f9fafb', cursor: 'pointer', font: 'inherit', textAlign: 'left',
        background: attention ? '#fffdf5' : '#fff',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
      onMouseLeave={(e) => (e.currentTarget.style.background = attention ? '#fffdf5' : '#fff')}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
          {o.isNew && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '20px', background: '#dbeafe', color: '#1d4ed8', flex: 'none' }}>NEW ORDER</span>}
        </span>
        {attention
          ? <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#b45309', marginTop: '2px' }}>⚠ {attention}</span>
          : stage === 'recurring'
            ? <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#166534', marginTop: '2px' }}>✓ Onboarded</span>
            : <span style={{ display: 'block', fontSize: '12px', color: MUTED, marginTop: '2px' }}>On track</span>}
      </span>

      <span>
        {off ? (
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: off.bg, color: off.fg }}>{off.label}</span>
        ) : (
          <>
            <span style={{ display: 'flex', gap: '3px', marginBottom: '5px' }}>
              {ROLLOUT_STEPS.map((s, i) => (
                <span key={s.value} style={{ flex: 1, height: '6px', borderRadius: '99px', background: i <= idx ? (stage === 'recurring' ? '#16a34a' : INK) : '#e5e7eb' }} />
              ))}
            </span>
            <span style={{ fontSize: '12.5px', color: INK, fontWeight: 600 }}>
              {ROLLOUT_STEPS[idx]?.label}
              <span style={{ color: MUTED, fontWeight: 400 }}> · step {idx + 1} of {ROLLOUT_STEPS.length}</span>
            </span>
          </>
        )}
      </span>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '13px', color: v.nextStep ? INK : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.nextStep ?? ROLLOUT_STEPS[idx]?.doNext ?? '—'}
        </span>
        <span style={{ display: 'block', fontSize: '11.5px', marginTop: '2px', color: late !== null && late > 0 ? '#b91c1c' : MUTED, fontWeight: late !== null && late > 0 ? 700 : 400 }}>
          {v.nextStepDue
            ? late !== null && late > 0 ? `${late}d late · was due ${format(v.nextStepDue, 'd MMM')}` : `by ${format(v.nextStepDue, 'EEE d MMM')}`
            : 'no date'}
          {v.owner ? ` · ${v.owner}` : ''}
        </span>
      </span>

      <span style={{ minWidth: 0, fontSize: '13px', color: contact ? INK : '#b45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {contact ? contact.name : 'Nobody yet'}
        {contact?.role && !contact.role.startsWith('From the account') && <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>{contact.role}</span>}
      </span>

      <span style={{ fontSize: '13px', color: r.picked ? INK : MUTED }}>
        {r.picked ? <><strong>{r.picked}</strong> wanted</> : 'none picked'}
        <span style={{ display: 'block', fontSize: '11.5px', color: r.agreed ? '#166534' : MUTED }}>{r.agreed} price{r.agreed === 1 ? '' : 's'} agreed</span>
      </span>

      <span style={{ fontSize: '13px', color: o.last ? INK : MUTED }}>
        {o.last ? format(o.last.createdAt, 'EEE d MMM') : 'never'}
        <span style={{ display: 'block', fontSize: '11.5px', color: o.range.length ? '#166534' : MUTED }}>
          {o.range.length ? `${o.inWindow}/3 range orders · 6 wks` : o.last ? 'no range orders yet' : ''}
        </span>
      </span>
    </button>
  )
}
