'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format, startOfWeek, addWeeks, isSameWeek, differenceInCalendarDays, formatDistanceToNow } from 'date-fns'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Header from '@/components/layout/Header'
import { getProjects } from '@/lib/firestore/projects'
import { getDevelopment } from '@/lib/firestore/development'
import { getTastings } from '@/lib/firestore/tastings'
import { getRollouts } from '@/lib/firestore/rollouts'
import { getAllMenuDrinks } from '@/lib/firestore/menu'
import {
  Project, DevelopmentRecord, TastingSession, ProjectUpdate, RolloutVenue, MenuDrink,
  DEV_VARIANTS, PROJECT_CATEGORIES,
} from '@/types'

/**
 * Everything that moved, in one place.
 *
 * Projects, product development and tastings each keep their own update log.
 * Read separately they answer "what happened to this one"; laid end to end
 * they answer the question the weekly actually asks — what did the team move
 * this week, compared with last, and what has quietly stopped.
 */

type Source = 'project' | 'development' | 'tasting' | 'rollout'

// Categorical slots 1–4 of the reference palette, in order. They share one
// stacked chart, so the adjacent pairs are what has to separate (validated on
// white). Aqua and yellow sit under 3:1 on white, so identity is also carried
// by legend, labels and the table view — never the colour alone.
const SOURCES: { value: Source; label: string; color: string }[] = [
  { value: 'project',     label: 'Projects',            color: '#2a78d6' },
  { value: 'development', label: 'Product development', color: '#eb6834' },
  { value: 'tasting',     label: 'Tastings',            color: '#1baf7a' },
  { value: 'rollout',     label: 'Onboarding',          color: '#eda100' },
]
const sourceOf = (s: Source) => SOURCES.find((x) => x.value === s)!

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'
const GRID = '#f3f4f6'
const QUIET_DAYS = 14
const OPEN_STAGES = new Set(['not_started', 'brief', 'development', 'tasting', 'sign_off', 'launch'])

interface Event {
  key: string
  at: Date
  text: string
  kind: ProjectUpdate['kind']
  by?: string
  source: Source
  entityId: string
  entityName: string
  context?: string
  href: string
}

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px',
}
const kicker: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px',
}
const chip = (on: boolean): React.CSSProperties => ({
  border: 'none', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
  background: on ? INK : 'transparent', color: on ? '#fff' : SECONDARY,
})

const RANGES = [
  { weeks: 4, label: '4 weeks' },
  { weeks: 12, label: '12 weeks' },
  { weeks: 26, label: '6 months' },
  { weeks: 52, label: '12 months' },
]

const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 })

function explode(projects: Project[], dev: DevelopmentRecord[], tastings: TastingSession[], rollouts: RolloutVenue[], menus: MenuDrink[]): Event[] {
  const out: Event[] = []
  const push = (u: ProjectUpdate, i: number, base: Omit<Event, 'key' | 'at' | 'text' | 'kind' | 'by'>) => {
    const at = new Date(u.at)
    if (Number.isNaN(at.getTime())) return
    out.push({ ...base, key: `${base.source}:${base.entityId}:${i}:${u.at}`, at, text: u.text, kind: u.kind, by: u.by })
  }
  for (const p of projects) {
    const programme = PROJECT_CATEGORIES.find((c) => c.value === p.category)?.label
    const context = [p.accountName, programme].filter(Boolean).join(' · ') || undefined
    ;(p.updates ?? []).forEach((u, i) => push(u, i, {
      source: 'project', entityId: p.id, entityName: p.title, context, href: `/projects/${p.id}`,
    }))
  }
  for (const r of dev) {
    const variant = DEV_VARIANTS.find((v) => v.value === r.variant)?.short
    ;(r.updates ?? []).forEach((u, i) => push(u, i, {
      source: 'development', entityId: r.id, entityName: r.productName, context: variant, href: '/development',
    }))
  }
  for (const t of tastings) {
    ;(t.updates ?? []).forEach((u, i) => push(u, i, {
      source: 'tasting', entityId: t.id, entityName: `Tasting · ${t.accountName}`,
      context: t.scheduledAt ? format(t.scheduledAt, 'd MMM') : undefined, href: '/tastings',
    }))
  }
  for (const r of rollouts) {
    ;(r.updates ?? []).forEach((u, i) => push(u, i, {
      source: 'rollout', entityId: r.id, entityName: r.name, context: r.group ? `Onboarding · ${r.group}` : 'Onboarding', href: `/onboarding/${r.id}`,
    }))
  }
  const venueName = new Map(rollouts.map((r) => [r.id, r.name]))
  for (const d of menus) {
    ;(d.updates ?? []).forEach((u, i) => push(u, i, {
      source: 'rollout', entityId: `menu:${d.id}`, entityName: d.name, context: `${venueName.get(d.venueId) ?? 'Venue'} menu`, href: `/onboarding/${d.venueId}?drink=${d.id}`,
    }))
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime())
}

function delta(now: number, before: number) {
  if (!before) return now ? { text: 'new this week', tone: SECONDARY } : null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { text: 'same as last week', tone: SECONDARY }
  return { text: `${pct > 0 ? '+' : ''}${pct}% vs last week`, tone: pct > 0 ? '#166534' : '#b45309' }
}

export default function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  // Opens on a month: the log only began in September, so a longer window is
  // mostly empty weeks until there is history to fill it.
  const [weeks, setWeeks] = useState(4)
  const [sources, setSources] = useState<Source[]>(['project', 'development', 'tasting', 'rollout'])
  const [kind, setKind] = useState<'all' | 'note' | 'auto'>('all')
  const [person, setPerson] = useState('')
  const [q, setQ] = useState('')
  const [asTable, setAsTable] = useState(false)
  const [limit, setLimit] = useState(150)

  useEffect(() => {
    Promise.all([getProjects(), getDevelopment(), getTastings(), getRollouts(), getAllMenuDrinks()])
      .then(([p, d, t, r, s]) => { setProjects(p); setEvents(explode(p, d, t, r, s)) })
      .finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const thisWeek = weekStart(now)
  const from = addWeeks(thisWeek, -(weeks - 1))

  const people = useMemo(
    () => [...new Set(events.map((e) => e.by).filter((b): b is string => !!b))].sort(),
    [events]
  )

  // What the filters let through. The chart, tiles and feed all read this, so
  // they can never disagree with each other.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return events.filter((e) =>
      e.at >= from &&
      sources.includes(e.source) &&
      (kind === 'all' || e.kind === kind) &&
      (!person || e.by === person) &&
      (!needle || `${e.entityName} ${e.text} ${e.context ?? ''} ${e.by ?? ''}`.toLowerCase().includes(needle))
    )
  }, [events, from, sources, kind, person, q])

  const series = useMemo(() => {
    const rows = Array.from({ length: weeks }, (_, i) => {
      const start = addWeeks(from, i)
      return { key: start.toISOString(), label: format(start, 'd MMM'), start, project: 0, development: 0, tasting: 0, rollout: 0, total: 0 }
    })
    const index = new Map(rows.map((r, i) => [r.key, i]))
    for (const e of filtered) {
      const i = index.get(weekStart(e.at).toISOString())
      if (i === undefined) continue
      rows[i][e.source]++
      rows[i].total++
    }
    return rows
  }, [filtered, weeks, from])

  const stats = useMemo(() => {
    const lastWeek = addWeeks(thisWeek, -1)
    const inWeek = (w: Date) => filtered.filter((e) => isSameWeek(e.at, w, { weekStartsOn: 1 }))
    const cur = inWeek(thisWeek)
    const prev = inWeek(lastWeek)
    const touched = (list: Event[]) => new Set(list.map((e) => `${e.source}:${e.entityId}`)).size
    return {
      changes: cur.length, changesPrev: prev.length,
      touched: touched(cur), touchedPrev: touched(prev),
      notes: cur.filter((e) => e.kind === 'note').length,
      notesPrev: prev.filter((e) => e.kind === 'note').length,
    }
  }, [filtered, thisWeek])

  // Most moved in the window, by number of logged changes.
  const busiest = useMemo(() => {
    const m = new Map<string, { e: Event; n: number; last: Date }>()
    for (const e of filtered) {
      const k = `${e.source}:${e.entityId}`
      const cur = m.get(k)
      if (cur) { cur.n++; if (e.at > cur.last) cur.last = e.at }
      else m.set(k, { e, n: 1, last: e.at })
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6)
  }, [filtered])

  // Live projects nobody has touched in two weeks — the ones that stop without
  // anyone deciding they should.
  const quiet = useMemo(() => {
    return projects
      .filter((p) => OPEN_STAGES.has(p.stage) && p.decision !== 'parked')
      .map((p) => {
        const lastLogged = (p.updates ?? []).map((u) => new Date(u.at)).filter((d) => !Number.isNaN(d.getTime()))
        const last = [p.updatedAt, ...lastLogged].reduce((a, b) => (b > a ? b : a))
        return { p, last, days: differenceInCalendarDays(now, last) }
      })
      .filter((x) => x.days >= QUIET_DAYS)
      .sort((a, b) => b.days - a.days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  const grouped = useMemo(() => {
    const out: { week: Date; items: Event[] }[] = []
    for (const e of filtered.slice(0, limit)) {
      const w = weekStart(e.at)
      const last = out[out.length - 1]
      if (last && last.week.getTime() === w.getTime()) last.items.push(e)
      else out.push({ week: w, items: [e] })
    }
    return out
  }, [filtered, limit])

  const weekTotal = (w: Date) => filtered.filter((e) => weekStart(e.at).getTime() === w.getTime()).length

  const toggleSource = (s: Source) =>
    setSources((prev) => (prev.includes(s) ? (prev.length > 1 ? prev.filter((x) => x !== s) : prev) : [...prev, s]))

  const tiles = [
    { label: 'Changes this week', value: stats.changes, d: delta(stats.changes, stats.changesPrev) },
    { label: 'Things moved this week', value: stats.touched, d: delta(stats.touched, stats.touchedPrev) },
    { label: 'Notes written this week', value: stats.notes, d: delta(stats.notes, stats.notesPrev) },
    { label: `Live projects quiet ${QUIET_DAYS}+ days`, value: quiet.length, d: null, warn: quiet.length > 0 },
  ]

  return (
    <div>
      <Header
        title="Activity log"
        subtitle="Every change to projects, R&D, product development, tastings and onboarding — week over week."
      />

      {/* Filters: one row, above everything they drive */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '2px', background: '#f3f4f6', padding: '3px', borderRadius: '10px' }}>
          {RANGES.map((r) => (
            <button key={r.weeks} onClick={() => setWeeks(r.weeks)} style={chip(weeks === r.weeks)}>{r.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {SOURCES.map((s) => {
            const on = sources.includes(s.value)
            return (
              <button
                key={s.value}
                onClick={() => toggleSource(s.value)}
                aria-pressed={on}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                  border: `1px solid ${on ? '#d1d5db' : '#f3f4f6'}`, background: on ? '#fff' : '#fafafa',
                  borderRadius: '20px', padding: '5px 11px', fontSize: '12px', fontWeight: 500,
                  color: on ? INK : MUTED,
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: on ? s.color : '#e5e7eb' }} />
                {s.label}
              </button>
            )
          })}
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
          style={{ padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12.5px', color: '#374151', background: '#fff' }}>
          <option value="all">Changes and notes</option>
          <option value="note">Notes only</option>
          <option value="auto">Field changes only</option>
        </select>
        {people.length > 0 && (
          <select value={person} onChange={(e) => setPerson(e.target.value)}
            style={{ padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12.5px', color: '#374151', background: '#fff' }}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search changes…"
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12.5px', width: '200px', marginLeft: 'auto' }}
        />
      </div>

      {loading ? (
        <p style={{ fontSize: '13px', color: MUTED }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {tiles.map((t) => (
              <div key={t.label} style={card}>
                <p style={kicker}>{t.label}</p>
                <p style={{ margin: 0, fontSize: '26px', fontWeight: 600, color: t.warn ? '#b45309' : INK }}>{t.value}</p>
                {t.d && <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: t.d.tone }}>{t.d.text}</p>}
              </div>
            ))}
          </div>

          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '13.5px', fontWeight: 700, color: INK }}>Changes logged per week</p>
                <p style={{ margin: 0, fontSize: '11.5px', color: MUTED }}>
                  Weeks start Monday · {filtered.length} changes in the last {RANGES.find((r) => r.weeks === weeks)?.label}
                </p>
              </div>
              <button onClick={() => setAsTable((v) => !v)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', color: SECONDARY, textDecoration: 'underline' }}>
                {asTable ? 'Show as chart' : 'Show as table'}
              </button>
            </div>

            {asTable ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr>
                      {['Week of', ...SOURCES.filter((s) => sources.includes(s.value)).map((s) => s.label), 'Total'].map((h, i) => (
                        <th key={h} style={{ ...kicker, padding: '6px 10px', textAlign: i ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((r) => (
                      <tr key={r.key} style={{ borderTop: '1px solid #f9fafb' }}>
                        <td style={{ padding: '6px 10px', color: '#374151' }}>{format(r.start, 'd MMM yyyy')}</td>
                        {SOURCES.filter((s) => sources.includes(s.value)).map((s) => (
                          <td key={s.value} style={{ padding: '6px 10px', textAlign: 'right', color: SECONDARY, fontVariantNumeric: 'tabular-nums' }}>{r[s.value]}</td>
                        ))}
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={series} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#e5e7eb' }}
                      tick={{ fontSize: 11, fill: MUTED }} interval={weeks > 26 ? 3 : weeks > 12 ? 1 : 0} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: MUTED }} />
                    <Tooltip
                      cursor={{ fill: '#f9fafb' }}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, color: INK }}
                      labelFormatter={(l) => `Week of ${l}`}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: SECONDARY, paddingTop: 6 }} />
                    {SOURCES.filter((s) => sources.includes(s.value)).map((s, i, arr) => (
                      <Bar
                        key={s.value}
                        dataKey={s.value}
                        name={s.label}
                        stackId="a"
                        fill={s.color}
                        maxBarSize={24}
                        // The surface-coloured gap between stacked segments.
                        stroke="#fff"
                        strokeWidth={2}
                        radius={i === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '16px', marginBottom: '16px' }}>
            <div style={card}>
              <p style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: 700, color: INK }}>Moved the most</p>
              {busiest.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12.5px', color: MUTED }}>Nothing logged in this window.</p>
              ) : busiest.map(({ e, n, last }) => (
                <div key={`${e.source}:${e.entityId}`} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 0', borderTop: '1px solid #f9fafb' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sourceOf(e.source).color, flex: 'none' }} />
                  <Link href={e.href} style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.entityName}
                  </Link>
                  <span style={{ fontSize: '11.5px', color: MUTED, whiteSpace: 'nowrap' }}>last {formatDistanceToNow(last, { addSuffix: true }).replace('about ', '')}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: INK, minWidth: '26px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </div>
              ))}
            </div>

            <div style={card}>
              <p style={{ margin: '0 0 2px', fontSize: '13.5px', fontWeight: 700, color: INK }}>Gone quiet</p>
              <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: MUTED }}>
                Live projects with no change in {QUIET_DAYS} days or more. Parked, done and cancelled are left out.
              </p>
              {quiet.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12.5px', color: '#166534' }}>✓ Every live project moved in the last {QUIET_DAYS} days.</p>
              ) : (
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {quiet.map(({ p, days }) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 0', borderTop: '1px solid #f9fafb' }}>
                      <Link href={`/projects/${p.id}`} style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </Link>
                      <span style={{ fontSize: '11.5px', color: MUTED, whiteSpace: 'nowrap' }}>{p.owner ?? 'no owner'}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: days >= 30 ? '#991b1b' : '#b45309', minWidth: '44px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {days}d
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={card}>
            <p style={{ margin: '0 0 12px', fontSize: '13.5px', fontWeight: 700, color: INK }}>Every change</p>
            {grouped.length === 0 ? (
              <p style={{ margin: 0, fontSize: '12.5px', color: MUTED }}>Nothing matches these filters.</p>
            ) : grouped.map((g) => (
              <div key={g.week.toISOString()} style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '6px 0', borderBottom: '1px solid #e5e7eb', marginBottom: '2px',
                }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: INK }}>
                    {g.week.getTime() === thisWeek.getTime() ? 'This week' : g.week.getTime() === addWeeks(thisWeek, -1).getTime() ? 'Last week' : `Week of ${format(g.week, 'd MMM yyyy')}`}
                  </span>
                  <span style={{ fontSize: '11.5px', color: MUTED }}>{weekTotal(g.week)} changes</span>
                </div>
                {g.items.map((e) => {
                  const s = sourceOf(e.source)
                  return (
                    <div key={e.key} style={{ display: 'grid', gridTemplateColumns: '92px 150px minmax(0,1fr) auto', gap: '12px', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #fafafa' }}>
                      <span style={{ fontSize: '11.5px', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                        {format(e.at, 'EEE d MMM')}<br />{format(e.at, 'HH:mm')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: SECONDARY, minWidth: 0 }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flex: 'none' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <Link href={e.href} style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{e.entityName}</Link>
                        {e.context && <span style={{ fontSize: '11.5px', color: MUTED }}> · {e.context}</span>}
                        <span style={{ display: 'block', fontSize: '12.5px', color: e.kind === 'note' ? INK : SECONDARY, lineHeight: 1.45, marginTop: '1px' }}>
                          {e.kind === 'note' && <span style={{ fontWeight: 600 }}>Note: </span>}{e.text}
                        </span>
                      </span>
                      <span style={{ fontSize: '11.5px', color: MUTED, whiteSpace: 'nowrap' }}>{e.by ?? ''}</span>
                    </div>
                  )
                })}
              </div>
            ))}
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 150)}
                style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: '8px', padding: '7px 14px', fontSize: '12.5px', color: '#374151', cursor: 'pointer' }}>
                Show {Math.min(150, filtered.length - limit)} more of {filtered.length - limit}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
