'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/ui/Button'
import { stepIndex, nextManualStage } from '@/lib/rollout'
import { ROLLOUT_STEPS, ROLLOUT_OFF_ROAD, RolloutContact } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, card, kicker, input, linkBtn } from './shared'
import toast from 'react-hot-toast'

const newId = () => Math.random().toString(36).slice(2, 10)

export default function OverviewSection({ ctx, onDropBrief, onBookTasting, onRemove }: {
  ctx: VenueCtx
  onDropBrief: () => void
  onBookTasting: () => void
  onRemove: () => void
}) {
  const { venue: v, stage, attention, readiness: rd, staff, patchVenue, goTo } = ctx
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<RolloutContact | null>(null)
  const idx = stepIndex(stage)
  const offRoad = ROLLOUT_OFF_ROAD.find((s) => s.value === stage)
  const next = nextManualStage(stage)
  const contacts = v.contacts ?? []

  const primary =
    stage === 'not_started' ? { label: '+ Add the main contact', run: () => setEditing({ id: newId(), name: '' }) }
    : stage === 'contact' ? (ctx.drinks.length ? { label: 'Book the tasting', run: onBookTasting } : { label: 'Drop their brief', run: onDropBrief })
    : stage === 'tasting_booked' ? { label: 'Open tastings', run: () => goTo('tastings') }
    : stage === 'tasted' ? { label: 'Open the menu', run: () => goTo('menu') }
    : stage === 'range_chosen' || stage === 'pricing_sent' ? { label: 'Check 80% GP', run: () => goTo('gp') }
    : stage === 'pricing_agreed' || stage === 'first_order' ? { label: 'See orders', run: () => goTo('orders') }
    : null

  async function saveContact(c: RolloutContact) {
    if (!c.name.trim()) return toast.error('Give the contact a name')
    const exists = contacts.some((x) => x.id === c.id)
    const list = exists ? contacts.map((x) => (x.id === c.id ? c : x)) : [...contacts, c]
    await patchVenue(
      { contacts: list, ...(stage === 'not_started' && !exists ? { stage: 'contact' as const } : {}) },
      undefined,
      exists ? `Contact updated: ${c.name}` : `Contact added: ${c.name}${c.role ? ` (${c.role})` : ''}`
    )
    setEditing(null)
  }

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {/* the road */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: INK }}>
            {offRoad
              ? <span style={{ padding: '3px 10px', borderRadius: '20px', background: offRoad.bg, color: offRoad.fg }}>{offRoad.label}</span>
              : <>Step {idx + 1} of {ROLLOUT_STEPS.length} · {ROLLOUT_STEPS[idx]?.label}</>}
          </p>
          <span style={{ fontSize: '12px', color: SECONDARY }}>
            {offRoad
              ? <button onClick={() => patchVenue({ stage: 'contact' }, undefined, 'Back in onboarding')} style={linkBtn}>Put back in onboarding</button>
              : <>
                  <button onClick={() => patchVenue({ stage: 'paused' })} style={linkBtn}>Pause</button>{' · '}
                  <button onClick={() => { if (confirm(`Mark ${v.name} as lost?`)) patchVenue({ stage: 'lost' }) }} style={linkBtn}>Mark lost</button>
                </>}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ROLLOUT_STEPS.length}, minmax(0,1fr))`, opacity: offRoad ? 0.45 : 1 }}>
          {ROLLOUT_STEPS.map((s, i) => {
            const done = !offRoad && i < idx
            const here = !offRoad && i === idx
            return (
              <button key={s.value} disabled={s.auto} onClick={() => !s.auto && patchVenue({ stage: s.value })}
                title={s.auto ? 'Moves on its own when orders arrive' : `Set to "${s.label}"`}
                style={{ border: 'none', background: 'none', padding: 0, cursor: s.auto ? 'default' : 'pointer', font: 'inherit', position: 'relative' }}>
                {i > 0 && <span style={{ position: 'absolute', top: '13px', right: '50%', width: '100%', height: '2px', background: done || here ? INK : '#e5e7eb' }} />}
                <span style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px', borderRadius: '50%', fontSize: '12px', fontWeight: 700,
                  background: done ? INK : here ? '#fff' : '#f3f4f6', color: done ? '#fff' : here ? INK : MUTED,
                  border: here ? `2px solid ${INK}` : '2px solid transparent', boxShadow: '0 0 0 3px #fff',
                }}>{done ? '✓' : i + 1}</span>
                <span style={{ display: 'block', marginTop: '6px', fontSize: '11px', lineHeight: 1.25, color: here ? INK : done ? SECONDARY : MUTED, fontWeight: here ? 700 : 500 }}>{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* do next + readiness */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: '14px' }}>
        {!offRoad && (
          <div style={{ ...card, border: `1.5px solid ${attention ? '#fcd34d' : '#e5e7eb'}`, background: attention ? '#fffbeb' : '#fff' }}>
            <p style={kicker}>Do next{attention ? ` · ⚠ ${attention}` : ''}</p>
            <input
              key={`next-${v.nextStep ?? ''}`}
              defaultValue={v.nextStep ?? ''}
              placeholder={ROLLOUT_STEPS[idx]?.doNext}
              onBlur={(e) => e.target.value.trim() !== (v.nextStep ?? '') && patchVenue({ nextStep: e.target.value.trim() || undefined })}
              style={{ ...input, fontSize: '17px', fontWeight: 600, color: INK, border: '1px solid transparent', background: 'transparent', padding: '4px 0' }}
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              {primary && <Button onClick={primary.run}>{primary.label}</Button>}
              {next && (
                <Button variant="secondary" onClick={() => patchVenue({ stage: next, nextStep: undefined, nextStepDue: undefined })}>
                  ✓ Done — go to &ldquo;{ROLLOUT_STEPS[stepIndex(next)].label}&rdquo;
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px', fontSize: '12.5px', color: SECONDARY }}>
              By
              <input type="date" value={v.nextStepDue ? format(v.nextStepDue, 'yyyy-MM-dd') : ''}
                onChange={(e) => patchVenue({ nextStepDue: e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined })}
                style={{ ...input, width: '150px', padding: '6px 8px', fontFamily: 'monospace', fontSize: '12.5px' }} />
              Owner
              <select value={v.owner ?? ''} onChange={(e) => patchVenue({ owner: e.target.value || undefined })}
                style={{ ...input, width: '130px', padding: '6px 8px', fontSize: '12.5px', cursor: 'pointer' }}>
                <option value="">—</option>
                {staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
              </select>
            </div>
          </div>
        )}

        <div style={{ ...card, border: `1.5px solid ${rd.allGood ? '#bbf7d0' : '#f3f4f6'}`, background: rd.allGood ? '#f0fdf4' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ ...kicker, margin: 0 }}>Ready for the tasting?</p>
            <span style={{ fontSize: '22px', fontWeight: 700, color: rd.allGood ? '#166534' : INK }}>{rd.allGood ? 'All good ✓' : `${rd.pct}%`}</span>
          </div>
          <div style={{ height: '8px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', margin: '8px 0 10px' }}>
            <div style={{ width: `${rd.pct}%`, height: '100%', background: rd.allGood ? '#16a34a' : INK }} />
          </div>
          {rd.checks.map((c) => (
            <button key={c.key} onClick={() => goTo(c.goto)} style={{
              display: 'flex', width: '100%', alignItems: 'center', gap: '9px', padding: '6px 0', border: 'none',
              borderTop: '1px solid #f9fafb', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
            }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, background: c.done ? '#16a34a' : '#f3f4f6', color: c.done ? '#fff' : MUTED }}>{c.done ? '✓' : ''}</span>
              <span style={{ flex: 1, fontSize: '13px', color: c.done ? SECONDARY : INK, fontWeight: c.done ? 500 : 600 }}>{c.label}</span>
              <span style={{ fontSize: '12px', color: c.done ? '#166534' : '#b45309' }}>{c.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '14px' }}>
        {/* brief + contacts */}
        <div style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ ...kicker, margin: 0 }}>Their brief</p>
              <Button size="sm" variant="secondary" onClick={onDropBrief}>{v.brief ? 'Drop another brief' : 'Drop their brief'}</Button>
            </div>
            {v.brief ? (
              <>
                <p style={{ margin: 0, fontSize: '13.5px', color: INK, lineHeight: 1.55 }}>{v.brief.summary}</p>
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: MUTED }}>
                  Received {format(new Date(v.brief.receivedAt), 'd MMM yyyy')} · {v.brief.source}
                </p>
                {v.brief.warnings && <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: '8px' }}>⚠ {v.brief.warnings}</p>}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>
                No brief yet. Drop the email and whatever they attached — their menu, prices and tasting date fill themselves in.
              </p>
            )}
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ ...kicker, margin: 0 }}>Who to talk to</p>
              {!editing && <Button size="sm" variant="secondary" onClick={() => setEditing({ id: newId(), name: '' })}>+ Add person</Button>}
            </div>
            {contacts.length === 0 && !editing && <p style={{ margin: 0, fontSize: '13px', color: '#b45309' }}>Nobody yet. Add the person who says yes.</p>}
            {contacts.map((c) => (
              <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid #f9fafb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: INK }}>{c.name}</span>
                  {c.role && <span style={{ fontSize: '12px', color: MUTED }}>{c.role}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {([['decides', 'Decides'], ['orders', 'Places orders']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => saveContact({ ...c, [k]: !c[k] })} style={{
                        border: `1px solid ${c[k] ? '#bbf7d0' : '#e5e7eb'}`, background: c[k] ? '#dcfce7' : '#fff',
                        color: c[k] ? '#166534' : MUTED, borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                      }}>{c[k] ? '✓ ' : ''}{l}</button>
                    ))}
                    <button onClick={() => setEditing(c)} style={linkBtn}>Edit</button>
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: SECONDARY }}>
                  {c.email && <a href={`mailto:${c.email}`} style={{ color: '#1d4ed8' }}>{c.email}</a>}
                  {c.email && c.phone && ' · '}
                  {c.phone && <a href={`tel:${c.phone}`} style={{ color: '#1d4ed8' }}>{c.phone}</a>}
                </p>
              </div>
            ))}
            {editing && (
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px', marginTop: '6px', display: 'grid', gap: '8px' }}>
                <input autoFocus value={editing.name} placeholder="Name" onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={input} />
                <input value={editing.role ?? ''} placeholder="Role — bar manager, GM, owner…" onChange={(e) => setEditing({ ...editing, role: e.target.value || undefined })} style={input} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input value={editing.email ?? ''} placeholder="Email" onChange={(e) => setEditing({ ...editing, email: e.target.value || undefined })} style={input} />
                  <input value={editing.phone ?? ''} placeholder="Phone" onChange={(e) => setEditing({ ...editing, phone: e.target.value || undefined })} style={input} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {contacts.some((x) => x.id === editing.id)
                    ? <button onClick={async () => {
                        if (!confirm(`Remove ${editing.name}?`)) return
                        await patchVenue({ contacts: contacts.filter((x) => x.id !== editing.id) }, undefined, `Contact removed: ${editing.name}`)
                        setEditing(null)
                      }} style={{ ...linkBtn, color: '#dc2626' }}>Remove</button>
                    : <span />}
                  <span style={{ display: 'flex', gap: '8px' }}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => saveContact(editing)}>Save person</Button>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* notes */}
        <div style={{ ...card, alignSelf: 'start' }}>
          <p style={kicker}>Write down what happened</p>
          <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await patchVenue({}, note); setNote('') }}
            style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called Tom, trial moved to the 30th…" style={input} />
            <Button type="submit" disabled={!note.trim()}>Save</Button>
          </form>
          <p style={kicker}>What is stopping it</p>
          <input key={`blocker-${v.blocker ?? ''}`} defaultValue={v.blocker ?? ''} placeholder="Nothing"
            onBlur={(e) => e.target.value.trim() !== (v.blocker ?? '') && patchVenue({ blocker: e.target.value.trim() || undefined })}
            style={{ ...input, color: v.blocker ? '#b91c1c' : undefined, marginBottom: '14px' }} />
          <p style={kicker}>Latest</p>
          {(v.updates ?? []).slice(0, 8).map((u, i) => (
            <div key={u.at + i} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderTop: '1px solid #fafafa' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', marginTop: '6px', flex: 'none', background: u.kind === 'note' ? INK : '#d1d5db' }} />
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: u.kind === 'note' ? INK : SECONDARY }}>{u.kind === 'note' && <strong>Note: </strong>}{u.text}</p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: MUTED }}>{format(new Date(u.at), 'EEE d MMM, HH:mm')}{u.by ? ` · ${u.by}` : ''}</p>
              </div>
            </div>
          ))}
          <button onClick={() => goTo('timeline')} style={{ ...linkBtn, marginTop: '6px' }}>Everything, including every drink →</button>
        </div>
      </div>

      <div style={{ paddingTop: '6px' }}>
        <button onClick={() => { if (confirm(`Remove ${v.name} from onboarding?\n\nIts contacts and notes here are deleted. The account, its orders, its price list and its menu drinks are not touched.`)) onRemove() }}
          style={{ ...linkBtn, color: '#dc2626' }}>Remove {v.name} from onboarding</button>
      </div>
    </div>
  )
}
