'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import SsbDrinkPanel from '@/components/objectives/SsbDrinkPanel'
import { getSsbDrinks, seedSsbMenuIfEmpty, updateSsbDrinkLogged, getSsbMeta, saveSsbMeta, SsbMeta } from '@/lib/firestore/ssb'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getStaffUsers, StaffUser } from '@/lib/firestore/staffUsers'
import { useTable, ColumnDef } from '@/hooks/useTable'
import { currentUserName } from '@/lib/currentUser'
import {
  OVERLAP_LABEL, SSB_DEFAULT_TRIAL, SSB_NOT_ON_MENU, VENUE_GP_TARGET, priceMaths, gpColor,
} from '@/lib/ssb'
import { Ingredient, Product, Recipe, SsbDrink, SsbStage, SSB_STAGES } from '@/types'
import toast from 'react-hot-toast'

/**
 * Spring Street Bar's menu, from Tom's list to signed off for the trial.
 * Every drink on one screen; click one to do anything with it.
 */

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'

type Tab = 'menu' | 'overlap' | 'pricing' | 'timeline'
type Filter = 'all' | 'todo' | 'changes' | 'unpriced' | 'signed'

interface Row { d: SsbDrink; gp: number; changed: boolean }

const stageIndex = (s: SsbStage) => SSB_STAGES.findIndex((x) => x.value === s)

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'order',    label: '#',              width: 46,  align: 'right', sortValue: (r) => r.d.order },
  { key: 'name',     label: 'Drink',          width: 220, sortValue: (r) => r.d.name },
  { key: 'overlap',  label: 'Our range',      width: 170, sortValue: (r) => r.d.overlap },
  { key: 'stage',    label: 'Step',           width: 160, sortValue: (r) => stageIndex(r.d.stage) },
  { key: 'sale',     label: 'Menu price',     width: 100, align: 'right', sortValue: (r) => r.d.sale, descFirst: true },
  { key: 'gp',       label: 'GP',             width: 80,  align: 'right', sortValue: (r) => r.gp, descFirst: true },
  { key: 'price',    label: 'Price',          width: 120, sortValue: (r) => (r.d.priceConfirmed ? 1 : 0) },
  { key: 'spec',     label: 'Spec',           width: 80,  sortValue: (r) => (r.d.spec ? 1 : 0), descFirst: true },
  { key: 'feedback', label: 'Feedback / next',width: 260, sortValue: (r) => r.d.feedback ?? r.d.nextStep },
  { key: 'owner',    label: 'Owner',          width: 110, sortValue: (r) => r.d.owner },
  { key: 'signed',   label: 'Signed off',     width: 150, sortValue: (r) => r.d.signedOffAt },
]

export default function SpringStreetBarPage() {
  const [drinks, setDrinks] = useState<SsbDrink[]>([])
  const [meta, setMeta] = useState<SsbMeta>({})
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('menu')
  const [filter, setFilter] = useState<Filter>('all')
  const started = useRef(false)
  const cols = useTable<Row>('ssb-menu', COLUMNS)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const created = await seedSsbMenuIfEmpty()
        if (created) toast.success(`${created} drinks from Tom's menu added`)
      } catch (e) {
        console.error(e)
        toast.error('Could not set the menu up — refresh to try again')
      }
      const [dr, m, p, r, i, s] = await Promise.all([getSsbDrinks(), getSsbMeta(), getProducts(), getRecipes(), getIngredients(), getStaffUsers()])
      setDrinks(dr); setMeta(m); setProducts(p); setRecipes(r); setIngredients(i); setStaff(s)
      // Arriving from the Activity log with ?drink= opens that drink.
      const want = new URLSearchParams(window.location.search).get('drink')
      if (want && dr.some((x) => x.id === want)) setOpenId(want)
      setLoading(false)
    })()
  }, [])

  async function patch(d: SsbDrink, data: Partial<SsbDrink>, note?: string, auto?: string) {
    setDrinks((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...data, updatedAt: new Date() } : x)))
    try {
      const updates = await updateSsbDrinkLogged(d, data, note, auto)
      setDrinks((prev) => prev.map((x) => (x.id === d.id ? { ...x, updates } : x)))
    } catch (e) {
      console.error(e)
      toast.error('Did not save — try again')
      setDrinks(await getSsbDrinks())
    }
  }

  const trialDate = meta.trialDate ?? SSB_DEFAULT_TRIAL
  const daysLeft = differenceInCalendarDays(new Date(trialDate + 'T12:00:00'), startOfDay(new Date()))

  const live = drinks.filter((d) => d.stage !== 'dropped')
  const counts = {
    all: drinks.length,
    todo: live.filter((d) => d.stage !== 'signed_off').length,
    changes: live.filter((d) => d.stage === 'changes').length,
    unpriced: live.filter((d) => !d.priceConfirmed).length,
    signed: live.filter((d) => d.stage === 'signed_off').length,
  }
  const readiness = live.length ? Math.round((counts.signed / live.length) * 100) : 0

  // Twenty-odd rows: computed on each render, nothing worth caching.
  const rows: Row[] = drinks
    .filter((d) =>
      filter === 'all' ? true
      : filter === 'todo' ? d.stage !== 'signed_off' && d.stage !== 'dropped'
      : filter === 'changes' ? d.stage === 'changes'
      : filter === 'unpriced' ? !d.priceConfirmed && d.stage !== 'dropped'
      : d.stage === 'signed_off'
    )
    .map((d) => ({
      d,
      gp: priceMaths(d.cost, d.sale).gp,
      changed: Math.abs(d.cost - d.sheetCost) >= 0.005 || Math.abs(d.sale - d.sheetSale) >= 0.005,
    }))

  const avgGp = live.length ? live.reduce((s, d) => s + priceMaths(d.cost, d.sale).gp, 0) / live.length : 0
  const underTarget = live.filter((d) => priceMaths(d.cost, d.sale).gp < VENUE_GP_TARGET)

  const timeline = useMemo(() => drinks
    .flatMap((d) => (d.updates ?? []).map((u) => ({ ...u, drink: d })))
    .filter((u) => !Number.isNaN(new Date(u.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [drinks])

  const open = drinks.find((d) => d.id === openId)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'menu', label: `Menu · ${drinks.length}` },
    { key: 'overlap', label: 'Overlap with our range' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div>
      {open && (
        <div onClick={() => setOpenId(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px', overflowY: 'auto',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#f9fafb', borderRadius: '14px', width: '100%', maxWidth: '1100px', padding: '22px 24px 26px' }}>
            <SsbDrinkPanel
              key={open.id}
              drink={open}
              products={products}
              recipes={recipes}
              ingredients={ingredients}
              staff={staff}
              onPatch={(data, note, auto) => patch(open, data, note, auto)}
              onClose={() => setOpenId(null)}
            />
          </div>
        </div>
      )}

      <Header
        title="Spring Street Bar"
        subtitle="Their bespoke menu — review each drink, confirm its price and sign it off before the trial."
        action={<Link href="/objectives"><Button size="sm" variant="ghost">← Objectives</Button></Link>}
      />

      {/* trial + readiness */}
      <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px', marginBottom: '14px', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '24px', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trial service</p>
          <p style={{ margin: '2px 0 4px', fontSize: '26px', fontWeight: 700, color: daysLeft < 0 ? MUTED : daysLeft <= 5 ? '#b91c1c' : INK }}>
            {daysLeft > 0 ? `${daysLeft} days` : daysLeft === 0 ? 'Today' : 'Done'}
          </p>
          <input type="date" value={trialDate}
            onChange={async (e) => { if (!e.target.value) return; const next = { ...meta, trialDate: e.target.value }; setMeta(next); await saveSsbMeta({ trialDate: e.target.value }) }}
            style={{ border: '1px solid #e5e7eb', borderRadius: '7px', padding: '4px 7px', fontSize: '12.5px', fontFamily: 'monospace', color: SECONDARY }} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{counts.signed} of {live.length} signed off</span>
            <span style={{ fontSize: '12.5px', color: MUTED }}>{readiness}% ready · {live.length - counts.unpriced} prices confirmed</span>
          </div>
          <div style={{ height: '10px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${readiness}%`, height: '100%', background: readiness === 100 ? '#16a34a' : INK, transition: 'width .2s' }} />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: MUTED }}>
            Average GP {avgGp.toFixed(1)}%{underTarget.length ? ` · ${underTarget.length} under ${VENUE_GP_TARGET}%` : ''}
          </p>
        </div>
      </div>

      {/* tiles = filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {([
          { key: 'all', label: 'All drinks', value: counts.all },
          { key: 'todo', label: 'Still to do', value: counts.todo },
          { key: 'changes', label: 'Changes asked', value: counts.changes, warn: counts.changes > 0 },
          { key: 'unpriced', label: 'Price not confirmed', value: counts.unpriced, warn: counts.unpriced > 0 },
          { key: 'signed', label: 'Signed off', value: counts.signed, good: counts.signed > 0 },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => { setFilter(t.key); if (tab === 'overlap' || tab === 'timeline') setTab('menu') }} style={{
            textAlign: 'left', cursor: 'pointer', font: 'inherit', borderRadius: '12px', padding: '12px 14px', background: '#fff',
            border: `1.5px solid ${filter === t.key ? INK : '#f3f4f6'}`,
          }}>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</span>
            <span style={{ display: 'block', fontSize: '24px', fontWeight: 600, marginTop: '2px', color: 'warn' in t && t.warn ? '#b45309' : 'good' in t && t.good ? '#166534' : INK }}>{t.value}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content', marginBottom: '14px' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 15px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? INK : SECONDARY,
            boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: '13px', color: MUTED }}>Loading the menu…</p>
      ) : tab === 'menu' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: MUTED }}>Click a drink to open it. Every column sorts and resizes.</span>
            <cols.ResetButton />
          </div>
          <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflowX: 'auto' }}>
            <table className="dt" style={{ minWidth: cols.minWidth }}>
              <cols.ColGroup />
              <cols.Head />
              <tbody>
                {cols.sortRows(rows).map(({ d, gp, changed }) => {
                  const st = SSB_STAGES.find((s) => s.value === d.stage) ?? SSB_STAGES[0]
                  const ov = OVERLAP_LABEL[d.overlap]
                  return (
                    <tr
                      key={d.id}
                      onClick={(e) => { if ((e.target as HTMLElement).closest('select, button, a, input')) return; setOpenId(d.id) }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f9fafb', opacity: d.stage === 'dropped' ? 0.45 : 1, background: d.stage === 'signed_off' ? '#f7fdf9' : undefined }}
                    >
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: MUTED, fontSize: '12px' }}>{d.order}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: INK, fontSize: '14px' }}>{d.name}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: ov.bg, color: ov.fg }}>
                          {d.overlap === 'none' ? ov.label : `${d.overlap === 'same' ? '=' : '≈'} ${d.classicName ?? ''}`}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <select value={d.stage} onChange={(e) => patch(d, { stage: e.target.value as SsbStage })}
                          style={{ width: '100%', padding: '4px 6px', border: 'none', borderRadius: '20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: st.bg, color: st.fg, textAlign: 'center' }}>
                          {SSB_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: INK }}>
                        £{d.sale.toFixed(2)}{changed && <span title={`Sheet: £${d.sheetSale.toFixed(2)}`} style={{ color: '#b45309' }}> •</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: gpColor(gp) }}>{gp.toFixed(1)}%</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: d.priceConfirmed ? '#166534' : MUTED }}>{d.priceConfirmed ? '✓ Confirmed' : 'Not confirmed'}</span>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12px', color: d.spec ? '#166534' : MUTED }}>{d.spec ? '✓ On file' : '—'}</td>
                      <td style={{ padding: '10px 8px', fontSize: '12.5px', color: d.feedback ? INK : MUTED }}>
                        {d.feedback ? `“${d.feedback}”` : d.nextStep ?? st.doNext}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12.5px', color: d.owner ? INK : MUTED }}>{d.owner ?? '—'}</td>
                      <td style={{ padding: '10px 8px', fontSize: '12px', color: d.signedOffAt ? '#166534' : MUTED }}>
                        {d.signedOffAt ? `${d.signedOffBy ?? '✓'} · ${format(new Date(d.signedOffAt), 'd MMM')}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'overlap' ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '14px' }}>
            {(['same', 'twist', 'none'] as const).map((k) => {
              const list = drinks.filter((d) => d.overlap === k)
              const lab = OVERLAP_LABEL[k]
              return (
                <div key={k} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }}>
                  <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 700, color: INK }}>
                    {k === 'same' ? 'Same as our classics' : k === 'twist' ? 'Twists on our classics' : 'Bespoke — not in our range'}
                    <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: lab.bg, color: lab.fg }}>{list.length}</span>
                  </p>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: MUTED }}>
                    {k === 'same' ? 'We already make these — our recipe and cost apply.' : k === 'twist' ? 'Start from our recipe and change it.' : 'Written from their spec.'}
                  </p>
                  {list.map((d) => {
                    const st = SSB_STAGES.find((s) => s.value === d.stage) ?? SSB_STAGES[0]
                    return (
                      <button key={d.id} onClick={() => setOpenId(d.id)} style={{
                        display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                        padding: '8px 0', border: 'none', borderTop: '1px solid #f9fafb', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                      }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: INK }}>{d.name}</span>
                          {d.classicName && <span style={{ fontSize: '11.5px', color: MUTED }}>{k === 'same' ? '=' : '≈'} our {d.classicName}</span>}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>{st.label}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px', marginTop: '14px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '13.5px', fontWeight: 700, color: INK }}>On Tom&apos;s spec sheet, not on the menu</p>
            {SSB_NOT_ON_MENU.map((x) => (
              <p key={x.name} style={{ margin: '4px 0', fontSize: '13px', color: SECONDARY }}><strong style={{ color: INK }}>{x.name}</strong> — {x.note}</p>
            ))}
          </div>
        </div>
      ) : tab === 'pricing' ? (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                {['Drink', 'Cost / serve', 'Menu price', 'Net sale', 'Margin', 'GP', 'Was on the sheet', 'Confirmed'].map((h, i) => (
                  <th key={h} style={{ padding: '9px 10px', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.d.stage !== 'dropped').map(({ d, gp, changed }) => {
                const m = priceMaths(d.cost, d.sale)
                const s = priceMaths(d.sheetCost, d.sheetSale)
                const priceInput = (field: 'cost' | 'sale') => (
                  <input
                    key={`${field}-${d.id}-${d[field]}`}
                    defaultValue={d[field].toFixed(2)}
                    inputMode="decimal"
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                      if (!Number.isFinite(n) || n <= 0) return
                      const val = Math.round(n * 100) / 100
                      if (val === d[field]) return
                      patch(d, { [field]: val, ...(d.priceConfirmed ? { priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined } : {}) },
                        undefined, d.priceConfirmed ? 'Price changed after it was confirmed — needs confirming again' : undefined)
                    }}
                    style={{ width: '82px', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '7px', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                )
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid #f9fafb' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <button onClick={() => setOpenId(d.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: INK }}>{d.name}</button>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{priceInput('cost')}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{priceInput('sale')}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: SECONDARY, fontVariantNumeric: 'tabular-nums' }}>£{m.net.toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: SECONDARY, fontVariantNumeric: 'tabular-nums' }}>£{m.margin.toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: gpColor(gp), fontVariantNumeric: 'tabular-nums' }}>{gp.toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: changed ? '#b45309' : MUTED, fontVariantNumeric: 'tabular-nums' }}>
                      {changed ? `£${d.sheetCost.toFixed(2)} / £${d.sheetSale.toFixed(2)} · ${s.gp.toFixed(1)}%` : 'unchanged'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        onClick={() => patch(d,
                          d.priceConfirmed
                            ? { priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined }
                            : { priceConfirmed: true, priceConfirmedBy: currentUserName() ?? undefined, priceConfirmedAt: new Date().toISOString() },
                          undefined,
                          d.priceConfirmed ? 'Price unconfirmed' : `Price confirmed: £${d.sale.toFixed(2)} on the menu, £${d.cost.toFixed(2)} cost, ${gp.toFixed(1)}% GP`)}
                        style={{
                          border: `1px solid ${d.priceConfirmed ? '#bbf7d0' : '#e5e7eb'}`, background: d.priceConfirmed ? '#dcfce7' : '#fff',
                          color: d.priceConfirmed ? '#166534' : SECONDARY, borderRadius: '20px', padding: '3px 11px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                        }}
                      >{d.priceConfirmed ? '✓ Confirmed' : 'Confirm'}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ margin: 0, padding: '10px 14px', fontSize: '12px', color: MUTED, borderTop: '1px solid #f3f4f6' }}>
            Net sale is the menu price without 20% VAT. GP is the margin on the net sale — green at {VENUE_GP_TARGET}% or more. Changing a confirmed price un-confirms it.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px' }}>
          {timeline.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>Nothing yet.</p>}
          {timeline.map((u, i) => (
            <div key={u.drink.id + u.at + i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderTop: i ? '1px solid #fafafa' : 'none' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', marginTop: '6px', flex: 'none', background: u.kind === 'note' ? INK : '#d1d5db' }} />
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: INK }}>
                  <button onClick={() => setOpenId(u.drink.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: INK }}>{u.drink.name}</button>
                  <span style={{ color: u.kind === 'note' ? INK : SECONDARY }}> — {u.kind === 'note' && <strong>Note: </strong>}{u.text}</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: MUTED }}>{format(new Date(u.at), 'EEE d MMM, HH:mm')}{u.by ? ` · ${u.by}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
