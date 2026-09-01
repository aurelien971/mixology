'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProject, updateProject, updateProjectLogged, deleteProject } from '@/lib/firestore/projects'
import {
  Project, ProjectKind, ProjectStage, ChecklistItem,
  PROJECT_KIND_LABELS, PROJECT_STAGES, projectScore, projectProgress,
} from '@/types'

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '20px 22px',
}
const label: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
  letterSpacing: '0.05em', display: 'block', marginBottom: '5px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: '13.5px', color: '#374151',
  border: '1px solid #e5e7eb', borderRadius: '7px', outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}

const STAGE_COLOR: Record<ProjectStage, { bg: string; fg: string }> = {
  brief:       { bg: '#f3f4f6', fg: '#4b5563' },
  development: { bg: '#f3e8ff', fg: '#7e22ce' },
  tasting:     { bg: '#ffedd5', fg: '#c2410c' },
  sign_off:    { bg: '#fef3c7', fg: '#92400e' },
  launch:      { bg: '#dbeafe', fg: '#1d4ed8' },
  done:        { bg: '#dcfce7', fg: '#166534' },
  parked:      { bg: '#f3f4f6', fg: '#9ca3af' },
}

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [p, setP] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [newStep, setNewStep] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { getProject(id).then(setP).finally(() => setLoading(false)) }, [id])

  // Field changes go through the logged writer so the update feed fills itself.
  async function save(data: Partial<Project>, withNote?: string) {
    if (!p) return
    setSaving(true)
    try {
      const updates = await updateProjectLogged(p, data, withNote)
      setP({ ...p, ...data, updates, updatedAt: new Date() })
    } finally { setSaving(false) }
  }

  // Checklist and scope edits are frequent and self-evident on screen, so they
  // write straight through rather than filling the feed with noise.
  async function quiet(data: Partial<Project>) {
    if (!p) return
    setP({ ...p, ...data, updatedAt: new Date() })
    await updateProject(p.id, data)
  }

  async function setChecklist(list: ChecklistItem[], logText?: string) {
    if (!p) return
    if (logText) await save({ checklist: list }, logText)
    else await quiet({ checklist: list })
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>
  if (!p) return (
    <div>
      <Header title="Project not found" subtitle="It may have been deleted." />
      <Link href="/projects"><Button size="sm" variant="secondary">← Back to the board</Button></Link>
    </div>
  )

  const list = p.checklist ?? []
  const progress = projectProgress(p)
  const score = projectScore(p)
  const sc = STAGE_COLOR[p.stage] ?? STAGE_COLOR.brief
  const assignees = p.assignees ?? []

  return (
    <div>
      <Header
        title={p.title}
        subtitle={`${PROJECT_KIND_LABELS[p.kind]}${p.accountName ? ' · ' + p.accountName : ''} · last updated ${formatDistanceToNow(p.updatedAt, { addSuffix: true })}`}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {saving && <span style={{ fontSize: '11.5px', color: '#9ca3af' }}>Saving…</span>}
            <Button
              size="sm" variant="secondary"
              onClick={() => save({ decision: p.decision === 'top' ? undefined : 'top' })}
            >
              {p.decision === 'top' ? '★ Picked this month' : '☆ Pick for this month'}
            </Button>
            <Link href="/projects"><Button size="sm" variant="ghost">← Board</Button></Link>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: '16px', alignItems: 'start' }}>

        {/* ── left: what it is and what is left ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={card}>
            <span style={label}>Title</span>
            <input
              defaultValue={p.title}
              onBlur={(e) => e.target.value !== p.title && save({ title: e.target.value })}
              style={{ ...input, fontSize: '16px', fontWeight: 600, color: '#111827' }}
            />
            <div style={{ marginTop: '14px' }}>
              <span style={label}>Scope — what done looks like</span>
              <textarea
                defaultValue={p.scope ?? ''}
                onBlur={(e) => e.target.value !== (p.scope ?? '') && quiet({ scope: e.target.value })}
                rows={4}
                placeholder="The deliverable, the standard it has to hit, and what is explicitly out."
                style={{ ...input, resize: 'vertical', lineHeight: 1.55 }}
              />
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
              <span style={{ ...label, marginBottom: 0 }}>To do</span>
              {progress && (
                <span style={{ fontSize: '12px', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                  {progress.done}/{progress.total} · {progress.pct}%
                </span>
              )}
            </div>

            {progress && (
              <div style={{ height: '4px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '14px' }}>
                <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? '#16a34a' : '#111827' }} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {list.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 2px', borderBottom: '1px solid #fafafa' }}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => {
                      const done = e.target.checked
                      setChecklist(
                        list.map((x) => x.id === item.id ? { ...x, done, doneAt: done ? new Date().toISOString() : undefined } : x),
                        done ? `Done: ${item.text}` : undefined
                      )
                    }}
                    style={{ width: '15px', height: '15px', flex: 'none', cursor: 'pointer' }}
                  />
                  <input
                    defaultValue={item.text}
                    onBlur={(e) => e.target.value !== item.text && setChecklist(list.map((x) => x.id === item.id ? { ...x, text: e.target.value } : x))}
                    style={{
                      ...input, border: '1px solid transparent', padding: '3px 5px', flex: 1,
                      textDecoration: item.done ? 'line-through' : 'none',
                      color: item.done ? '#9ca3af' : '#374151',
                    }}
                  />
                  <input
                    placeholder="who"
                    defaultValue={item.owner ?? ''}
                    onBlur={(e) => e.target.value !== (item.owner ?? '') && setChecklist(list.map((x) => x.id === item.id ? { ...x, owner: e.target.value } : x))}
                    style={{ ...input, border: '1px solid transparent', padding: '3px 5px', width: '84px', fontSize: '12px', color: '#6b7280' }}
                  />
                  <input
                    type="date"
                    value={item.due ?? ''}
                    onChange={(e) => setChecklist(list.map((x) => x.id === item.id ? { ...x, due: e.target.value || undefined } : x))}
                    style={{ ...input, border: '1px solid transparent', padding: '3px 5px', width: '124px', fontSize: '11.5px', fontFamily: 'monospace', color: '#6b7280' }}
                  />
                  <button
                    onClick={() => setChecklist(list.filter((x) => x.id !== item.id))}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '15px' }}
                    title="Remove step"
                  >×</button>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newStep.trim()) return
                setChecklist([...list, { id: newId(), text: newStep.trim(), done: false }])
                setNewStep('')
              }}
              style={{ display: 'flex', gap: '8px', marginTop: '12px' }}
            >
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Add a step and press enter"
                style={input}
              />
              <Button size="sm" variant="secondary" type="submit" disabled={!newStep.trim()}>Add</Button>
            </form>
          </div>

          {/* ── updates ─────────────────────────────────────────────────── */}
          <div style={card}>
            <span style={label}>Updates</span>
            <form
              onSubmit={(e) => { e.preventDefault(); if (note.trim()) { save({}, note); setNote('') } }}
              style={{ display: 'flex', gap: '8px', margin: '0 0 16px' }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What moved? Tasting booked, samples sent, waiting on Chris…"
                style={input}
              />
              <Button size="sm" type="submit" disabled={!note.trim()}>Post</Button>
            </form>

            {(p.updates ?? []).length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                Nothing logged yet. Changing the stage, owner, date or blocker records itself here.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(p.updates ?? []).map((u, i) => (
                  <div key={u.at + i} style={{ display: 'flex', gap: '12px', padding: '9px 0', borderBottom: '1px solid #fafafa' }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', marginTop: '6px', flex: 'none',
                      background: u.kind === 'note' ? '#111827' : '#d1d5db',
                    }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '13.5px', color: u.kind === 'note' ? '#111827' : '#6b7280', lineHeight: 1.45 }}>{u.text}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#c4c4c4', fontFamily: 'monospace' }}>
                        {format(new Date(u.at), 'd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── right: the facts ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={card}>
            <div style={{ display: 'grid', gap: '13px' }}>
              <div>
                <span style={label}>Stage</span>
                <select
                  value={p.stage}
                  onChange={(e) => save({ stage: e.target.value as ProjectStage })}
                  style={{ ...input, background: sc.bg, color: sc.fg, fontWeight: 600, cursor: 'pointer' }}
                >
                  {PROJECT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <span style={label}>Type</span>
                <select
                  value={p.kind}
                  onChange={(e) => quiet({ kind: e.target.value as ProjectKind })}
                  style={{ ...input, cursor: 'pointer' }}
                >
                  {Object.entries(PROJECT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              <div>
                <span style={label}>Owner — one name, accountable</span>
                <input
                  defaultValue={p.owner ?? ''}
                  onBlur={(e) => e.target.value !== (p.owner ?? '') && save({ owner: e.target.value })}
                  placeholder="Nobody yet"
                  style={input}
                />
              </div>

              <div>
                <span style={label}>Also on it</span>
                <input
                  defaultValue={assignees.join(', ')}
                  onBlur={(e) => {
                    const next = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                    if (next.join(',') !== assignees.join(',')) quiet({ assignees: next })
                  }}
                  placeholder="Comma separated"
                  style={input}
                />
                {assignees.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                    {assignees.map((a) => (
                      <span key={a} style={{ fontSize: '11.5px', padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#4b5563' }}>{a}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span style={label}>Due</span>
                <input
                  type="date"
                  value={p.dueDate ? format(p.dueDate, 'yyyy-MM-dd') : ''}
                  onChange={(e) => save({ dueDate: e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined })}
                  style={{ ...input, fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <span style={label}>Next step</span>
                <input
                  defaultValue={p.nextStep ?? ''}
                  onBlur={(e) => e.target.value !== (p.nextStep ?? '') && save({ nextStep: e.target.value })}
                  style={input}
                />
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'grid', gap: '13px' }}>
              <div>
                <span style={label}>Blocker — what is actually stopping it</span>
                <input
                  defaultValue={p.blocker ?? ''}
                  onBlur={(e) => e.target.value !== (p.blocker ?? '') && save({ blocker: e.target.value })}
                  placeholder="Nothing"
                  style={{ ...input, color: p.blocker ? '#b91c1c' : undefined }}
                />
              </div>
              <div>
                <span style={label}>Gatekeeper — who has to say yes</span>
                <input
                  defaultValue={p.gatekeeper ?? ''}
                  onBlur={(e) => e.target.value !== (p.gatekeeper ?? '') && quiet({ gatekeeper: e.target.value })}
                  style={input}
                />
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <span style={label}>Opp 1–5</span>
                <input
                  type="number" min={1} max={5}
                  defaultValue={p.opportunity ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value ? Math.min(5, Math.max(1, Number(e.target.value))) : undefined
                    if (v !== p.opportunity) quiet({ opportunity: v })
                  }}
                  style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <span style={label}>Prize £</span>
                <input
                  type="number"
                  defaultValue={p.prizeGbp ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined
                    if (v !== p.prizeGbp) save({ prizeGbp: v })
                  }}
                  style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <span style={label}>Days</span>
                <input
                  type="number"
                  defaultValue={p.effortDays ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined
                    if (v !== p.effortDays) save({ effortDays: v })
                  }}
                  style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '14px', paddingTop: '13px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>Priority score</span>
              <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', color: score === null ? '#d1d5db' : '#111827' }}>
                {score ?? '—'}
              </span>
            </div>
          </div>

          <div style={card}>
            <span style={label}>Outcome</span>
            <textarea
              defaultValue={p.outcome ?? ''}
              onBlur={(e) => e.target.value !== (p.outcome ?? '') && quiet({ outcome: e.target.value })}
              rows={3}
              placeholder="What actually came out of it."
              style={{ ...input, resize: 'vertical', lineHeight: 1.55 }}
            />
          </div>

          <button
            onClick={() => {
              if (confirm(`Delete "${p.title}"? This cannot be undone.`)) {
                deleteProject(p.id).then(() => router.push('/projects'))
              }
            }}
            style={{
              alignSelf: 'flex-start', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '12.5px', color: '#c4c4c4', padding: '2px 0',
            }}
          >
            Delete this project
          </button>
        </div>
      </div>
    </div>
  )
}
