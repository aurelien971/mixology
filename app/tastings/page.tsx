'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, isToday,
} from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import NewTastingModal from '@/components/tastings/NewTastingModal'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getAccounts } from '@/lib/firestore/accounts'
import { getStaffUsers, StaffUser } from '@/lib/firestore/staffUsers'
import { getTastings, updateTasting, updateTastingLogged, deleteTasting } from '@/lib/firestore/tastings'
import { splitRecipeCost } from '@/lib/pricing'
import { useTable, ColumnDef } from '@/hooks/useTable'
import {
  Account, Product, Recipe, Ingredient, TastingSession, TastingStage, TastingItem,
  TastingVerdict, TASTING_STAGES, TASTING_OPEN_STAGES, TASTING_VERDICTS, DEV_VARIANTS,
  tastingVerdicts,
} from '@/types'
import toast from 'react-hot-toast'

const td: React.CSSProperties = {
  padding: '8px 10px', fontSize: '13px', color: '#374151', verticalAlign: 'middle',
}
const field: React.CSSProperties = {
  width: '100%', padding: '5px 7px', fontSize: '12.5px', color: '#374151',
  border: '1px solid transparent', borderRadius: '6px', outline: 'none',
  background: 'transparent', boxSizing: 'border-box', fontFamily: 'inherit',
}

function money(n: number) { return '£' + n.toFixed(2) }
const stageOf = (s: TastingStage) => TASTING_STAGES.find((x) => x.value === s) ?? TASTING_STAGES[0]
const verdictOf = (v: TastingVerdict) => TASTING_VERDICTS.find((x) => x.value === v) ?? TASTING_VERDICTS[0]

interface Row {
  t: TastingSession
  yes: number
  pending: number
}

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'venue',   label: 'Venue',       width: 190, sortValue: (r) => r.t.accountName },
  { key: 'stage',   label: 'Stage',       width: 132, sortValue: (r) => TASTING_STAGES.findIndex((s) => s.value === r.t.stage) },
  { key: 'date',    label: 'When',        width: 124, sortValue: (r) => r.t.scheduledAt },
  { key: 'owner',   label: 'Owner',       width: 106, sortValue: (r) => r.t.owner },
  { key: 'pour',    label: 'Pouring',     width: 92, align: 'right', sortValue: (r) => r.t.items.length, descFirst: true },
  { key: 'verdict', label: 'Said yes to', width: 108, align: 'right', sortValue: (r) => r.yes, descFirst: true },
  { key: 'where',   label: 'Where',       width: 140, sortValue: (r) => r.t.location },
  { key: 'next',    label: 'Next step',   width: 190, sortValue: (r) => r.t.nextStep },
  { key: 'notes',   label: 'Notes',       width: 180, sortValue: (r) => r.t.notes },
  { key: 'updated', label: 'Updated',     width: 104, align: 'right', sortValue: (r) => r.t.updatedAt, descFirst: true },
]

export default function TastingsPage() {
  const [tastings, setTastings] = useState<TastingSession[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<TastingStage | 'all' | 'open'>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  const cols = useTable<Row>('tastings', COLUMNS)

  function load() {
    Promise.all([getTastings(), getAccounts(), getProducts(), getRecipes(), getIngredients(), getStaffUsers()])
      .then(([t, a, p, r, i, s]) => {
        setTastings(t); setAccounts(a); setProducts(p); setRecipes(r); setIngredients(i); setStaff(s)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Cost per litre by drink and format, so a price on the pour list can be
  // judged the moment it is typed.
  const costs = useMemo(() => {
    const m: Record<string, { premix: number | null; syrup: number | null }> = {}
    for (const p of products) {
      const r = recipes.find((x) => x.productId === p.id)
      if (!r) { m[p.id] = { premix: null, syrup: null }; continue }
      const split = splitRecipeCost(r, ingredients)
      m[p.id] = { premix: split.complete ? split.totalPerLitre : null, syrup: split.mixerPerLitre || null }
    }
    return m
  }, [products, recipes, ingredients])

  const rows = useMemo<Row[]>(() => {
    return tastings
      .filter((t) =>
        filter === 'all' ? true
        : filter === 'open' ? TASTING_OPEN_STAGES.includes(t.stage)
        : t.stage === filter
      )
      .map((t) => {
        const v = tastingVerdicts(t)
        return { t, yes: v.yes, pending: v.pending }
      })
      .sort((a, b) => {
        const at = a.t.scheduledAt?.getTime() ?? Infinity
        const bt = b.t.scheduledAt?.getTime() ?? Infinity
        return at - bt
      })
  }, [tastings, filter])

  const stats = useMemo(() => {
    const now = new Date()
    const inPlay = tastings.filter((t) => TASTING_OPEN_STAGES.includes(t.stage))
    const decided = tastings.filter((t) => t.stage === 'won' || t.stage === 'lost')
    const won = tastings.filter((t) => t.stage === 'won')
    return {
      open: inPlay.length,
      ahead: inPlay.filter((t) => t.scheduledAt && t.scheduledAt >= now).length,
      undated: inPlay.filter((t) => !t.scheduledAt).length,
      won: won.length,
      rate: decided.length ? Math.round((won.length / decided.length) * 100) : null,
      drinks: new Set(tastings.flatMap((t) => t.items.map((i) => i.productId))).size,
    }
  }, [tastings])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of tastings) m[t.stage] = (m[t.stage] ?? 0) + 1
    return m
  }, [tastings])

  // The month grid, Monday-first, whole weeks so the shape does not jump.
  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month])

  async function patch(t: TastingSession, data: Partial<TastingSession>, logNote?: string) {
    setTastings((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...data, updatedAt: new Date() } : x)))
    const updates = await updateTastingLogged(t, data, logNote)
    setTastings((prev) => prev.map((x) => (x.id === t.id ? { ...x, updates } : x)))
  }

  async function quiet(t: TastingSession, data: Partial<TastingSession>) {
    setTastings((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...data, updatedAt: new Date() } : x)))
    await updateTasting(t.id, data)
  }

  async function setItem(t: TastingSession, index: number, patchItem: Partial<TastingItem>) {
    const items = t.items.map((it, i) => (i === index ? { ...it, ...patchItem } : it))
    await quiet(t, { items })
  }

  async function remove(t: TastingSession) {
    if (!confirm(`Delete the tasting for ${t.accountName}? This cannot be undone.`)) return
    await deleteTasting(t.id)
    setTastings((prev) => prev.filter((x) => x.id !== t.id))
    toast.success('Deleted')
  }

  return (
    <div>
      {adding && (
        <NewTastingModal
          accounts={accounts}
          products={products}
          recipes={recipes}
          ingredients={ingredients}
          staff={staff}
          onClose={() => setAdding(false)}
          onSaved={load}
        />
      )}

      <Header
        title="Tastings"
        subtitle="Who we are pouring for, what is on the list, and what it would cost them."
        action={<Button size="sm" onClick={() => setAdding(true)}>New tasting</Button>}
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'In play', v: String(stats.open) },
          { k: 'Booked ahead', v: String(stats.ahead) },
          { k: 'No date yet', v: String(stats.undated), warn: stats.undated > 0 },
          { k: 'Won', v: String(stats.won) },
          { k: 'Conversion', v: stats.rate === null ? '—' : `${stats.rate}%` },
          { k: 'Drinks poured', v: String(stats.drinks) },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* the calendar */}
      <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 16px 16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#111827' }}>{format(month, 'MMMM yyyy')}</p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Button size="sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, -1))}>←</Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>→</Button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px', background: '#f3f4f6', border: '1px solid #f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{ background: '#fafafa', padding: '5px 8px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
          ))}
          {days.map((d) => {
            const onDay = tastings.filter((t) => t.scheduledAt && isSameDay(t.scheduledAt, d))
            const outside = !isSameMonth(d, month)
            return (
              <div key={d.toISOString()} style={{
                background: outside ? '#fcfcfd' : '#fff', minHeight: '74px', padding: '5px 6px',
                opacity: outside ? 0.5 : 1,
              }}>
                <p style={{
                  margin: '0 0 4px', fontSize: '11px', fontWeight: isToday(d) ? 700 : 500,
                  color: isToday(d) ? '#fff' : '#9ca3af',
                  ...(isToday(d)
                    ? { display: 'inline-block', background: '#111827', borderRadius: '20px', padding: '1px 7px' }
                    : {}),
                }}>{format(d, 'd')}</p>
                {onDay.map((t) => {
                  const sc = stageOf(t.stage)
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setFilter('all'); setOpen(t.id) }}
                      title={`${t.accountName} — ${t.items.length} cocktails`}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', marginBottom: '3px',
                        border: 'none', borderRadius: '5px', padding: '2px 5px', cursor: 'pointer',
                        background: sc.bg, color: sc.fg, fontSize: '10.5px', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {t.accountName}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        {stats.undated > 0 && (
          <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: '#b45309' }}>
            {stats.undated} tasting{stats.undated === 1 ? '' : 's'} in play with no date — they stay off the calendar
            until one is set.
          </p>
        )}
      </div>

      {/* stage tracker */}
      <div className="flex gap-1 mb-3 flex-wrap items-center">
        {([
          { value: 'open' as const, label: 'In play', n: TASTING_OPEN_STAGES.reduce((s, v) => s + (counts[v] ?? 0), 0) },
          ...TASTING_STAGES.map((s) => ({ value: s.value, label: s.label, n: counts[s.value] ?? 0 })),
          { value: 'all' as const, label: 'Everything', n: tastings.length },
        ]).map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {s.label}
            <span className={filter === s.value ? 'ml-1.5 opacity-60' : 'ml-1.5 text-gray-300'}>{s.n}</span>
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}><cols.ResetButton /></span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '26px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#374151' }}>
            {tastings.length === 0
              ? 'No tastings yet. Set one up and pick what we are pouring.'
              : 'Nothing at this stage.'}
          </p>
          {tastings.length === 0 && <Button size="sm" onClick={() => setAdding(true)}>New tasting</Button>}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map((r) => {
                const t = r.t
                const sc = stageOf(t.stage)
                const isOpen = open === t.id
                return (
                  <React.Fragment key={t.id}>
                    <tr style={{ borderBottom: '1px solid #f9fafb', background: isOpen ? '#f9fafb' : undefined }}>
                      <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                        <button
                          onClick={() => setOpen(isOpen ? null : t.id)}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, textAlign: 'left' }}
                        >
                          {t.accountName}
                        </button>
                        {t.isProspect && (
                          <span style={{ marginLeft: '7px', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', background: '#e0f2fe', color: '#0369a1' }}>
                            prospect
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        <select
                          value={t.stage}
                          onChange={(e) => patch(t, { stage: e.target.value as TastingStage })}
                          style={{ ...field, fontWeight: 600, cursor: 'pointer', textAlign: 'center', borderRadius: '20px', background: sc.bg, color: sc.fg }}
                        >
                          {TASTING_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input
                          type="date"
                          value={t.scheduledAt ? format(t.scheduledAt, 'yyyy-MM-dd') : ''}
                          onChange={(e) => patch(t, { scheduledAt: e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined })}
                          style={{ ...field, fontFamily: 'monospace', fontSize: '11.5px' }}
                        />
                      </td>
                      <td style={td}>
                        <select
                          value={t.owner ?? ''}
                          onChange={(e) => patch(t, { owner: e.target.value || undefined })}
                          style={{ ...field, cursor: 'pointer', color: t.owner ? '#374151' : '#fca5a5' }}
                        >
                          <option value="">—</option>
                          {staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
                        </select>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{t.items.length}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {r.pending === t.items.length ? (
                          <span style={{ color: '#d1d5db', fontSize: '11.5px' }}>not yet</span>
                        ) : (
                          <span style={{ fontWeight: 700, color: r.yes ? '#166534' : '#6b7280' }}>
                            {r.yes}<span style={{ fontWeight: 400, color: '#9ca3af' }}> / {t.items.length}</span>
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        <input
                          defaultValue={t.location ?? ''}
                          onBlur={(e) => e.target.value !== (t.location ?? '') && patch(t, { location: e.target.value || undefined })}
                          placeholder="—"
                          style={field}
                        />
                      </td>
                      <td style={td}>
                        <input
                          defaultValue={t.nextStep ?? ''}
                          onBlur={(e) => e.target.value !== (t.nextStep ?? '') && patch(t, { nextStep: e.target.value || undefined })}
                          placeholder="—"
                          style={field}
                        />
                      </td>
                      <td style={td}>
                        <input
                          defaultValue={t.notes ?? ''}
                          onBlur={(e) => e.target.value !== (t.notes ?? '') && quiet(t, { notes: e.target.value || undefined })}
                          placeholder="—"
                          style={field}
                        />
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
                        {format(t.updatedAt, 'd MMM')}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={COLUMNS.length} style={{ padding: 0, background: '#fbfbfc', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ padding: '16px 20px 20px', display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: '16px' }}>
                            {/* the pour list */}
                            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                                What we are pouring, and what we would charge
                              </p>
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '520px' }}>
                                  <thead>
                                    <tr style={{ background: '#fafafa' }}>
                                      {['Cocktail', 'Version', 'Costs us', 'We charge', 'Our GP', 'Verdict', 'Notes'].map((h) => (
                                        <th key={h} style={{
                                          padding: '6px 8px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
                                          textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                                          textAlign: h === 'Cocktail' || h === 'Version' || h === 'Notes' ? 'left' : 'right',
                                        }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {t.items.map((it, i) => {
                                      const cost = costs[it.productId]?.[it.variant]
                                      const gp = cost !== null && cost !== undefined && it.pricePerLitre > 0
                                        ? ((it.pricePerLitre - cost) / it.pricePerLitre) * 100 : null
                                      const vc = verdictOf(it.verdict)
                                      return (
                                        <tr key={it.productId + it.variant + i} style={{ borderTop: '1px solid #f9fafb' }}>
                                          <td style={{ padding: '5px 8px', fontWeight: 600, color: '#111827' }}>{it.productName}</td>
                                          <td style={{ padding: '5px 8px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                            {DEV_VARIANTS.find((v) => v.value === it.variant)?.short}
                                          </td>
                                          <td style={{ padding: '5px 8px', textAlign: 'right', color: cost ? '#6b7280' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                                            {cost ? money(cost) : 'no recipe'}
                                          </td>
                                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                            <input
                                              defaultValue={it.pricePerLitre || ''}
                                              onBlur={(e) => {
                                                const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0
                                                if (n !== it.pricePerLitre) setItem(t, i, { pricePerLitre: n })
                                              }}
                                              inputMode="decimal"
                                              style={{ ...field, width: '76px', textAlign: 'right', fontFamily: 'monospace', border: '1px solid #f3f4f6' }}
                                            />
                                          </td>
                                          <td style={{
                                            padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                            color: gp === null ? '#d1d5db' : gp < 0 ? '#b91c1c' : gp < 40 ? '#b45309' : '#166534',
                                          }}>
                                            {gp === null ? '—' : gp.toFixed(0) + '%'}
                                          </td>
                                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                            <select
                                              value={it.verdict}
                                              onChange={(e) => setItem(t, i, { verdict: e.target.value as TastingVerdict })}
                                              style={{ ...field, width: '84px', fontWeight: 600, cursor: 'pointer', textAlign: 'center', borderRadius: '20px', background: vc.bg, color: vc.fg }}
                                            >
                                              {TASTING_VERDICTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                                            </select>
                                          </td>
                                          <td style={{ padding: '5px 8px' }}>
                                            <input
                                              defaultValue={it.notes ?? ''}
                                              onBlur={(e) => e.target.value !== (it.notes ?? '') && setItem(t, i, { notes: e.target.value || undefined })}
                                              placeholder="—"
                                              style={{ ...field, border: '1px solid #f3f4f6' }}
                                            />
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {t.contact && (
                                <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: '#6b7280' }}>
                                  <strong style={{ color: '#374151' }}>Contact:</strong> {t.contact}
                                </p>
                              )}
                              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => remove(t)}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11.5px', color: '#d1d5db' }}
                                >Delete this tasting</button>
                              </div>
                            </div>

                            {/* what happened */}
                            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                                What has happened
                              </p>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  if (!note.trim()) return
                                  patch(t, {}, note)
                                  setNote('')
                                }}
                                style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}
                              >
                                <input
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  placeholder="They want the Paloma on by December…"
                                  style={{ ...field, border: '1px solid #e5e7eb' }}
                                />
                                <Button size="sm" type="submit" disabled={!note.trim()}>Log</Button>
                              </form>
                              {(t.updates ?? []).length === 0 ? (
                                <p style={{ margin: 0, fontSize: '12.5px', color: '#9ca3af' }}>
                                  Nothing logged yet. Moving the stage, date, owner or next step records itself here.
                                </p>
                              ) : (
                                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                  {(t.updates ?? []).map((u, i) => (
                                    <div key={u.at + i} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid #fafafa' }}>
                                      <span style={{
                                        width: '6px', height: '6px', borderRadius: '50%', marginTop: '6px', flex: 'none',
                                        background: u.kind === 'note' ? '#111827' : '#d1d5db',
                                      }} />
                                      <div>
                                        <p style={{ margin: 0, fontSize: '12.5px', color: u.kind === 'note' ? '#111827' : '#6b7280', lineHeight: 1.45 }}>{u.text}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '10.5px', color: '#c4c4c4', fontFamily: 'monospace' }}>
                                          {format(new Date(u.at), 'd MMM yyyy, HH:mm')}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '14px', lineHeight: 1.6, maxWidth: '84ch' }}>
        A tasting is one meeting with one venue: the cocktails, the format of each, and the price we would offer.
        <strong style={{ color: '#6b7280' }}> Our GP is live against the recipe cost</strong>, so a price that works
        today stops working on screen the moment an ingredient moves. Verdicts are per drink — a venue rarely takes the
        whole list, and knowing which four they said yes to is the part worth keeping.
      </p>
    </div>
  )
}
