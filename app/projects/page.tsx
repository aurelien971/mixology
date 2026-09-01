'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProjects, createProject, updateProjectLogged, deleteProject } from '@/lib/firestore/projects'
import { getAllOrders } from '@/lib/firestore/orders'
import {
  Project,
  ProjectKind,
  ProjectStage,
  PROJECT_KIND_LABELS,
  PROJECT_STAGES,
  projectScore,
  projectProgress,
  Order,
} from '@/types'

// ── styles ───────────────────────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: '9px 10px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap',
}
const cell: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'middle' }
const field: React.CSSProperties = {
  width: '100%', padding: '5px 7px', fontSize: '13px', color: '#374151',
  border: '1px solid transparent', borderRadius: '6px', outline: 'none',
  background: 'transparent', boxSizing: 'border-box',
}
const numField: React.CSSProperties = { ...field, textAlign: 'right', fontFamily: 'monospace', fontSize: '12.5px' }

const STAGE_COLOR: Record<ProjectStage, { bg: string; fg: string }> = {
  brief:       { bg: '#f3f4f6', fg: '#4b5563' },
  development: { bg: '#f3e8ff', fg: '#7e22ce' },
  tasting:     { bg: '#ffedd5', fg: '#c2410c' },
  sign_off:    { bg: '#fef3c7', fg: '#92400e' },
  launch:      { bg: '#dbeafe', fg: '#1d4ed8' },
  done:        { bg: '#dcfce7', fg: '#166534' },
  parked:      { bg: '#f3f4f6', fg: '#9ca3af' },
}

function daysUntil(d?: Date): number | null {
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

// ── inline editors ───────────────────────────────────────────────────────────
// Everything saves on blur so the room can tab straight through a row.
function Text({ value, onSave, placeholder, style }: {
  value?: string; onSave: (v: string) => void; placeholder?: string; style?: React.CSSProperties
}) {
  const [v, setV] = useState(value ?? '')
  // Re-sync when the row is saved or reloaded, without an effect.
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(value ?? '') }
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? '')) onSave(v) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{ ...field, ...style }}
      onFocus={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.background = '#fff' }}
      onMouseLeave={(e) => { if (document.activeElement !== e.target) { e.currentTarget.style.borderColor = 'transparent' } }}
    />
  )
}

function Num({ value, onSave, placeholder, prefix }: {
  value?: number; onSave: (v: number | undefined) => void; placeholder?: string; prefix?: string
}) {
  const [v, setV] = useState(value === undefined ? '' : String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(value === undefined ? '' : String(value)) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
      {prefix && v !== '' && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{prefix}</span>}
      <input
        value={v}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = v.trim() === '' ? undefined : Number(v.replace(/[^0-9.]/g, ''))
          if (n !== value) onSave(Number.isFinite(n as number) ? n : undefined)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={numField}
        onFocus={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.background = '#fff' }}
      />
    </div>
  )
}

function DateField({ value, onSave }: { value?: Date; onSave: (d: Date | undefined) => void }) {
  const iso = value ? format(value, 'yyyy-MM-dd') : ''
  const late = daysUntil(value)
  return (
    <input
      type="date"
      value={iso}
      onChange={(e) => onSave(e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined)}
      style={{
        ...field, fontSize: '12px', fontFamily: 'monospace',
        color: late !== null && late < 0 ? '#dc2626' : late !== null && late <= 7 ? '#b45309' : '#4b5563',
      }}
    />
  )
}

// ── page ─────────────────────────────────────────────────────────────────────
type Tab = 'all' | 'top' | 'parked' | 'gaps'

type SortKey =
  | 'title' | 'kind' | 'stage' | 'owner' | 'dueDate' | 'nextStep'
  | 'blocker' | 'gatekeeper' | 'opportunity' | 'prizeGbp' | 'effortDays' | 'score' | 'updatedAt'

// Blanks always sink to the bottom whichever way the column is pointing —
// an empty owner is never the most interesting row.
function compare(a: unknown, b: unknown, dir: 1 | -1): number {
  const empty = (v: unknown) => v === undefined || v === null || v === ''
  if (empty(a) && empty(b)) return 0
  if (empty(a)) return 1
  if (empty(b)) return -1
  if (a instanceof Date && b instanceof Date) return (a.getTime() - b.getTime()) * dir
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b)) * dir
}

function Calendar({ projects, month, onMonth }: {
  projects: Project[]
  month: Date
  onMonth: (d: Date) => void
}) {
  // A full six-week grid so the box height never jumps between months.
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })
  const dated = projects.filter((p) => p.dueDate)
  const undated = projects.filter((p) => !p.dueDate && p.stage !== 'done')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <Button size="sm" variant="secondary" onClick={() => onMonth(addMonths(month, -1))}>←</Button>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827', minWidth: '150px' }}>
          {format(month, 'MMMM yyyy')}
        </span>
        <Button size="sm" variant="secondary" onClick={() => onMonth(addMonths(month, 1))}>→</Button>
        <Button size="sm" variant="ghost" onClick={() => onMonth(startOfMonth(new Date()))}>Today</Button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {days.map((day) => {
            const here = dated.filter((p) => isSameDay(p.dueDate as Date, day))
            const today = isSameDay(day, new Date())
            const thisMonth = isSameMonth(day, month)
            return (
              <div
                key={day.toISOString()}
                style={{
                  minHeight: '104px', padding: '7px 8px', borderRight: '1px solid #f9fafb', borderBottom: '1px solid #f9fafb',
                  background: today ? '#fffdf5' : thisMonth ? '#fff' : '#fcfcfc',
                }}
              >
                <p style={{
                  margin: '0 0 5px', fontSize: '11.5px', fontFamily: 'monospace',
                  fontWeight: today ? 700 : 400,
                  color: today ? '#b45309' : thisMonth ? '#6b7280' : '#d1d5db',
                }}>{format(day, 'd')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {here.map((p) => {
                    const overdue = (p.dueDate as Date).getTime() < Date.now() && p.stage !== 'done'
                    const sc = STAGE_COLOR[p.stage] ?? STAGE_COLOR.brief
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        title={`${p.title}${p.owner ? ' · ' + p.owner : ' · no owner'}`}
                        style={{
                          display: 'block', fontSize: '11px', lineHeight: 1.3, padding: '3px 6px', borderRadius: '5px',
                          textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          background: overdue ? '#fef2f2' : sc.bg,
                          color: overdue ? '#991b1b' : sc.fg,
                          fontWeight: p.decision === 'top' ? 700 : 500,
                        }}
                      >
                        {p.decision === 'top' ? '★ ' : ''}{p.title}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>
            {undated.length} live project{undated.length === 1 ? '' : 's'} with no date
          </p>
          <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: '0 0 10px' }}>
            Nothing on this calendar until they get one. That is the gap Mark asked you to close.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {undated.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                style={{
                  border: '1px solid #e5e7eb', borderRadius: '20px', padding: '4px 11px',
                  fontSize: '12px', color: '#4b5563', textDecoration: 'none',
                }}
              >{p.title}</Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SortHead({ label, k, sort, onSort, style }: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 1 | -1 } | null
  onSort: (k: SortKey) => void
  style?: React.CSSProperties
}) {
  const active = sort?.key === k
  return (
    <th style={{ ...th, ...style }}>
      <button
        onClick={() => onSort(k)}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
          color: active ? '#111827' : 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: '3px',
          width: '100%', justifyContent: style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        {label}
        <span style={{ fontSize: '9px', opacity: active ? 1 : 0.28 }}>
          {active ? (sort!.dir === 1 ? '▲' : '▼') : '▾'}
        </span>
      </button>
    </th>
  )
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [rdOrders, setRdOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [saving, setSaving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [bulk, setBulk] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'calendar'>('board')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  function load() {
    Promise.all([getProjects(), getAllOrders()])
      .then(([p, o]) => {
        setProjects(p)
        setRdOrders(o.filter((x) => x.type === 'rd' && x.status !== 'cancelled'))
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // R&D orders that have not been adopted onto the board yet
  const unclaimed = useMemo(() => {
    const claimed = new Set(projects.map((p) => p.linkedOrderId).filter(Boolean))
    return rdOrders.filter((o) => !claimed.has(o.id))
  }, [projects, rdOrders])

  // Board edits log themselves too, so the update feed on a project is the whole
  // story of it and not just what was typed on the detail page.
  async function patch(id: string, data: Partial<Project>) {
    const current = projects.find((p) => p.id === id)
    if (!current) return
    setSaving(id)
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data, updatedAt: new Date() } : p)))
    try {
      const updates = await updateProjectLogged(current, data)
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, updates } : p)))
    } finally { setSaving(null) }
  }

  function draftFromOrder(o: Order) {
    return {
      title: o.rdBrief?.slice(0, 80) || `${o.accountName} R&D`,
      kind: 'rd' as ProjectKind,
      accountName: o.accountName,
      stage: (o.rdStatus === 'completed' ? 'done' : o.rdStatus === 'on_hold' ? 'parked' : 'development') as ProjectStage,
      owner: o.rdAssignee,
      dueDate: o.rdEndDate,
      prizeGbp: o.rdPrice,
      outcome: o.rdOutcomes?.join('; '),
      linkedOrderId: o.id,
    }
  }

  // Every write goes through here. The guard is what stops a second click
  // landing while the first import is still running.
  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      const [p, o] = await Promise.all([getProjects(), getAllOrders()])
      setProjects(p)
      setRdOrders(o.filter((x) => x.type === 'rd' && x.status !== 'cancelled'))
    } finally {
      setBusy(false)
    }
  }

  const adopt = (o: Order) => run(async () => { await createProject(draftFromOrder(o)) })

  const addBlank = () => run(async () => {
    await createProject({ title: 'New project', kind: 'other', stage: 'brief' })
  })

  const adoptAll = () => run(async () => {
    // Re-check what is claimed at the moment of writing rather than trusting a
    // render-time snapshot, so a stale list can never create a second copy.
    const claimed = new Set((await getProjects()).map((p) => p.linkedOrderId).filter(Boolean))
    for (const o of rdOrders) {
      if (claimed.has(o.id)) continue
      await createProject(draftFromOrder(o))
      claimed.add(o.id)
    }
  })

  // One project per R&D order. Where there are several, the copy that has been
  // filled in the most wins — so a duplicate someone has already worked on is
  // the one that survives. Oldest breaks a tie.
  const duplicates = useMemo(() => {
    const filledIn = (p: Project) =>
      [p.owner, p.dueDate, p.nextStep, p.blocker, p.gatekeeper, p.opportunity, p.effortDays, p.decision]
        .filter((v) => v !== undefined && v !== '').length

    const byOrder = new Map<string, Project[]>()
    for (const p of projects) {
      if (!p.linkedOrderId) continue
      const list = byOrder.get(p.linkedOrderId) ?? []
      list.push(p)
      byOrder.set(p.linkedOrderId, list)
    }
    const extras: Project[] = []
    for (const list of byOrder.values()) {
      if (list.length < 2) continue
      list.sort((a, b) => filledIn(b) - filledIn(a) || a.createdAt.getTime() - b.createdAt.getTime())
      extras.push(...list.slice(1))
    }
    return extras
  }, [projects])

  // One project per non-empty line. Bullets and numbering are stripped so a
  // list pasted straight out of an email works.
  const bulkAdd = (text: string) => run(async () => {
    const titles = text
      .split('\n')
      .map((l) => l.replace(/^\s*[-•*\u2022]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
    for (const title of titles) {
      await createProject({ title, kind: 'rd', stage: 'brief' })
    }
    setBulk(null)
  })

  const removeDuplicates = () => run(async () => {
    for (const p of duplicates) await deleteProject(p.id)
  })

  const ranked = useMemo(() => {
    const withScore = projects.map((p) => ({ p, score: projectScore(p) }))

    if (sort) {
      const { key, dir } = sort
      withScore.sort((a, b) =>
        key === 'score'
          ? compare(a.score ?? undefined, b.score ?? undefined, dir)
          : compare(a.p[key], b.p[key], dir)
      )
      return withScore
    }

    // Default: this month's picks on top, then best score first.
    withScore.sort((a, b) => {
      if (a.p.decision === 'top' && b.p.decision !== 'top') return -1
      if (b.p.decision === 'top' && a.p.decision !== 'top') return 1
      if (a.score === null && b.score === null) return a.p.title.localeCompare(b.p.title)
      if (a.score === null) return 1
      if (b.score === null) return -1
      return b.score - a.score
    })
    return withScore
  }, [projects, sort])

  // First click sorts descending for the numbers you care about, ascending for
  // names and dates. Third click drops back to the default ranking.
  function toggleSort(key: SortKey) {
    const numeric = key === 'score' || key === 'opportunity' || key === 'prizeGbp' || key === 'effortDays'
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: numeric ? -1 : 1 }
      if (cur.dir === (numeric ? -1 : 1)) return { key, dir: numeric ? 1 : -1 }
      return null
    })
  }

  const visible = ranked.filter(({ p }) => {
    if (tab === 'top') return p.decision === 'top'
    if (tab === 'parked') return p.decision === 'parked' || p.stage === 'parked'
    if (tab === 'gaps') return !p.owner || !p.dueDate || projectScore(p) === null
    return true
  })

  // ── the numbers Mark asks for in the room ──────────────────────────────────
  const stats = useMemo(() => {
    const live = projects.filter((p) => p.stage !== 'done' && p.decision !== 'parked')
    return {
      total: projects.length,
      live: live.length,
      owned: projects.filter((p) => p.owner && p.dueDate).length,
      top: projects.filter((p) => p.decision === 'top').length,
      prize: live.reduce((s, p) => s + (p.prizeGbp ?? 0), 0),
      days: live.reduce((s, p) => s + (p.effortDays ?? 0), 0),
      topDays: projects.filter((p) => p.decision === 'top').reduce((s, p) => s + (p.effortDays ?? 0), 0),
      overdue: live.filter((p) => { const d = daysUntil(p.dueDate); return d !== null && d < 0 }).length,
      blocked: live.filter((p) => p.blocker).length,
    }
  }, [projects])

  return (
    <div>
      <Header
        title="Projects"
        subtitle="Every project, an owner and a date. Ranked by prize × opportunity ÷ effort."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            {unclaimed.length > 0 && (
              <Button size="sm" variant="secondary" onClick={adoptAll} loading={busy} disabled={busy}>
                ↓ Pull in {unclaimed.length} R&D
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setBulk(bulk === null ? '' : null)} disabled={busy}>
              ☰ Paste a list
            </Button>
            <Button size="sm" onClick={addBlank} disabled={busy}>+ New project</Button>
          </div>
        }
      />

      {duplicates.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px',
          padding: '13px 16px', marginBottom: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 700, color: '#92400e' }}>
              {duplicates.length} duplicate project{duplicates.length === 1 ? '' : 's'} on the board
            </p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#a16207' }}>
              The same R&amp;D job came in twice. Removing the extras keeps the first copy of each, so nothing you have typed is lost.
            </p>
          </div>
          <Button size="sm" onClick={removeDuplicates} loading={busy} disabled={busy}>
            Remove {duplicates.length} duplicate{duplicates.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      {/* Room summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(128px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px',
        overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'Live projects', v: String(stats.live) },
          { k: 'Owner + date', v: `${stats.owned}/${stats.total}`, warn: stats.owned < stats.total },
          { k: 'This month', v: `${stats.top} picked`, warn: stats.top > 7 },
          { k: 'Prize on the board', v: `£${(stats.prize / 1000).toFixed(0)}k` },
          { k: 'Bench days, live', v: String(stats.days) },
          { k: 'Bench days, top', v: String(stats.topDays) },
          { k: 'Overdue', v: String(stats.overdue), warn: stats.overdue > 0 },
          { k: 'Blocked', v: String(stats.blocked), warn: stats.blocked > 0 },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex gap-1 mr-2 border-r border-gray-200 pr-3">
          {([['board', 'Board'], ['calendar', 'Calendar']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {([['all', `All ${projects.length}`], ['top', `This month ${stats.top}`], ['parked', 'Parked'], ['gaps', `Missing ${projects.filter(p => !p.owner || !p.dueDate || projectScore(p) === null).length}`]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTab(v as Tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '11.5px', color: '#9ca3af' }}>
          {saving
            ? 'Saving…'
            : sort
              ? 'Sorted by column — click it twice more for the default ranking'
              : 'Ranked by score, this month\u2019s picks pinned on top'}
        </span>
      </div>

      {bulk !== null && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px 18px', marginBottom: '14px' }}>
          <p style={{ margin: '0 0 3px', fontSize: '13px', fontWeight: 700, color: '#111827' }}>Paste a list of projects</p>
          <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#9ca3af' }}>
            One per line. Bullets and numbering are stripped. They land as R&amp;D briefs — change the type per row afterwards.
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={8}
            placeholder={'Custard Syrup\nWhite choc sauce\nTangerine syrup'}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '13px', lineHeight: 1.6,
              border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none',
              fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
            <Button size="sm" onClick={() => bulkAdd(bulk)} loading={busy} disabled={busy || !bulk.trim()}>
              Create {bulk.split('\n').filter((l) => l.trim()).length || ''} project{bulk.split('\n').filter((l) => l.trim()).length === 1 ? '' : 's'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBulk(null)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : view === 'calendar' ? (
        <Calendar projects={visible.map((v) => v.p)} month={month} onMonth={setMonth} />
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1400px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                <th style={{ ...th, width: '38px', textAlign: 'center' }}>Top</th>
                <SortHead label="Project"    k="title"       sort={sort} onSort={toggleSort} style={{ minWidth: '230px' }} />
                <SortHead label="Type"       k="kind"        sort={sort} onSort={toggleSort} style={{ width: '110px' }} />
                <SortHead label="Stage"      k="stage"       sort={sort} onSort={toggleSort} style={{ width: '128px' }} />
                <SortHead label="Owner"      k="owner"       sort={sort} onSort={toggleSort} style={{ width: '110px' }} />
                <SortHead label="Due"        k="dueDate"     sort={sort} onSort={toggleSort} style={{ width: '128px' }} />
                <SortHead label="Next step"  k="nextStep"    sort={sort} onSort={toggleSort} style={{ minWidth: '150px' }} />
                <SortHead label="Blocker"    k="blocker"     sort={sort} onSort={toggleSort} style={{ minWidth: '140px' }} />
                <SortHead label="Gatekeeper" k="gatekeeper"  sort={sort} onSort={toggleSort} style={{ width: '110px' }} />
                <SortHead label="Opp"        k="opportunity" sort={sort} onSort={toggleSort} style={{ width: '62px', textAlign: 'right' }} />
                <SortHead label="Prize"      k="prizeGbp"    sort={sort} onSort={toggleSort} style={{ width: '86px', textAlign: 'right' }} />
                <SortHead label="Days"       k="effortDays"  sort={sort} onSort={toggleSort} style={{ width: '62px', textAlign: 'right' }} />
                <SortHead label="Score"      k="score"       sort={sort} onSort={toggleSort} style={{ width: '66px', textAlign: 'right' }} />
                <SortHead label="Updated"    k="updatedAt"   sort={sort} onSort={toggleSort} style={{ width: '96px', textAlign: 'right' }} />
                <th style={{ ...th, width: '34px' }} />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ p, score }) => {
                const late = daysUntil(p.dueDate)
                const sc = STAGE_COLOR[p.stage] ?? STAGE_COLOR.brief
                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid #f9fafb',
                      background: p.decision === 'top' ? '#fffdf5' : p.decision === 'parked' ? '#fcfcfc' : '#fff',
                      opacity: p.decision === 'parked' || p.stage === 'done' ? 0.6 : 1,
                    }}
                  >
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <button
                        onClick={() => patch(p.id, { decision: p.decision === 'top' ? undefined : 'top' })}
                        title="Pick for this month"
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px', lineHeight: 1,
                          color: p.decision === 'top' ? '#d97706' : '#e5e7eb', padding: '2px',
                        }}
                      >
                        ★
                      </button>
                    </td>
                    <td style={cell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Text value={p.title} onSave={(v) => patch(p.id, { title: v })} style={{ fontWeight: 600, color: '#111827' }} />
                        <Link
                          href={`/projects/${p.id}`}
                          title="Open scope, to-do list and updates"
                          style={{ fontSize: '13px', color: '#c4c4c4', textDecoration: 'none', padding: '0 4px', flex: 'none' }}
                        >↗</Link>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 2px 7px' }}>
                        {p.accountName && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{p.accountName}</span>}
                        {(() => {
                          const pr = projectProgress(p)
                          if (!pr) return null
                          return (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '34px', height: '3px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                                <span style={{ display: 'block', width: `${pr.pct}%`, height: '100%', background: pr.pct === 100 ? '#16a34a' : '#9ca3af' }} />
                              </span>
                              <span style={{ fontSize: '10.5px', color: '#9ca3af', fontFamily: 'monospace' }}>{pr.done}/{pr.total}</span>
                            </span>
                          )
                        })()}
                      </div>
                    </td>
                    <td style={cell}>
                      <select
                        value={p.kind}
                        onChange={(e) => patch(p.id, { kind: e.target.value as ProjectKind })}
                        style={{ ...field, fontSize: '12px', cursor: 'pointer' }}
                      >
                        {Object.entries(PROJECT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <select
                        value={p.stage}
                        onChange={(e) => patch(p.id, { stage: e.target.value as ProjectStage })}
                        style={{
                          ...field, fontSize: '11.5px', fontWeight: 600, cursor: 'pointer',
                          background: sc.bg, color: sc.fg, borderRadius: '20px', textAlign: 'center',
                        }}
                      >
                        {PROJECT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <Text value={p.owner} placeholder="—" onSave={(v) => patch(p.id, { owner: v })}
                        style={{ color: p.owner ? '#374151' : '#fca5a5', fontWeight: p.owner ? 500 : 400 }} />
                    </td>
                    <td style={cell}>
                      <DateField value={p.dueDate} onSave={(d) => patch(p.id, { dueDate: d })} />
                      {late !== null && late < 0 && (
                        <p style={{ fontSize: '10px', color: '#dc2626', margin: '0 0 0 7px', fontWeight: 600 }}>{Math.abs(late)}d late</p>
                      )}
                    </td>
                    <td style={cell}>
                      <Text value={p.nextStep} placeholder="—" onSave={(v) => patch(p.id, { nextStep: v })} style={{ fontSize: '12.5px' }} />
                    </td>
                    <td style={cell}>
                      <Text value={p.blocker} placeholder="—" onSave={(v) => patch(p.id, { blocker: v })}
                        style={{ fontSize: '12.5px', color: p.blocker ? '#b91c1c' : undefined }} />
                    </td>
                    <td style={cell}>
                      <Text value={p.gatekeeper} placeholder="—" onSave={(v) => patch(p.id, { gatekeeper: v })} style={{ fontSize: '12.5px' }} />
                    </td>
                    <td style={cell}>
                      <Num value={p.opportunity} placeholder="1-5" onSave={(v) => patch(p.id, { opportunity: v ? Math.min(5, Math.max(1, v)) : undefined })} />
                    </td>
                    <td style={cell}>
                      <Num value={p.prizeGbp} placeholder="£" prefix="£" onSave={(v) => patch(p.id, { prizeGbp: v })} />
                    </td>
                    <td style={cell}>
                      <Num value={p.effortDays} placeholder="d" onSave={(v) => patch(p.id, { effortDays: v })} />
                    </td>
                    <td style={{ ...cell, textAlign: 'right', paddingRight: '12px' }}>
                      {score === null
                        ? <span style={{ fontSize: '11px', color: '#d1d5db' }}>—</span>
                        : <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{score}</span>}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', paddingRight: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {formatDistanceToNow(p.updatedAt, { addSuffix: true }).replace('about ', '')}
                      </span>
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${p.title}"? This cannot be undone.`)) {
                            deleteProject(p.id).then(load)
                          }
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '15px', padding: '2px' }}
                        title="Delete project"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={14} style={{ padding: '36px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
                  Nothing here yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* R&D waiting to come onto the board */}
      {unclaimed.length > 0 && (
        <div style={{ marginTop: '18px', background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                {unclaimed.length} R&D {unclaimed.length === 1 ? 'job' : 'jobs'} not on the board
              </p>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                Pull one in and it keeps its assignee, dates and price.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={adoptAll} loading={busy} disabled={busy}>Pull in all</Button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {unclaimed.map((o) => (
              <button
                key={o.id}
                onClick={() => adopt(o)}
                disabled={busy}
                style={{
                  border: '1px solid #e5e7eb', background: '#fff', borderRadius: '20px',
                  padding: '5px 11px', fontSize: '12px', color: '#4b5563', cursor: 'pointer',
                }}
              >
                + {o.accountName} <span style={{ color: '#d1d5db' }}>{o.orderNumber}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '14px', lineHeight: 1.6, maxWidth: '760px' }}>
        <strong style={{ color: '#6b7280' }}>Score</strong> = (prize in £k × opportunity) ÷ bench days. Opportunity is 1–5:
        does it open a door — a new account, a new channel, contract compliance, proof for the deck.
        Starred rows are this month&apos;s list and sort to the top whatever they score.
      </p>
    </div>
  )
}
