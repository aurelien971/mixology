'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import { createProject } from '@/lib/firestore/projects'
import { getStaffUsers, StaffUser } from '@/lib/firestore/staffUsers'
import { getAccounts } from '@/lib/firestore/accounts'
import {
  Project, ProjectKind, ProjectStage, ProjectCategory, ProjectLocation,
  PROJECT_KIND_LABELS, PROJECT_STAGES, PROJECT_CATEGORIES, PROJECT_LOCATIONS,
} from '@/types'
import { Account } from '@/types'
import toast from 'react-hot-toast'

const label: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '5px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px',
  fontSize: '13.5px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
}

export default function NewProjectModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: () => void
}) {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ProjectKind>('rd')
  const [category, setCategory] = useState<ProjectCategory>('cocktails')
  const [location, setLocation] = useState<ProjectLocation>('uk')
  const [stage, setStage] = useState<ProjectStage>('brief')
  const [accountName, setAccountName] = useState('')
  const [owner, setOwner] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [due, setDue] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [scope, setScope] = useState('')
  const [gatekeeper, setGatekeeper] = useState('')
  const [prize, setPrize] = useState('')
  const [days, setDays] = useState('')
  const [opportunity, setOpportunity] = useState('')
  const [steps, setSteps] = useState('')

  useEffect(() => {
    Promise.all([getStaffUsers(), getAccounts()]).then(([u, a]) => { setUsers(u); setAccounts(a) })
  }, [])

  async function create() {
    if (!title.trim()) return toast.error('Give it a title')
    setSaving(true)
    try {
      const data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
        title: title.trim(),
        kind,
        stage,
        ...(category ? { category } : {}),
        ...(location ? { location } : {}),
        ...(accountName ? { accountName } : {}),
        ...(owner ? { owner } : {}),
        ...(assignees.length ? { assignees } : {}),
        ...(due ? { dueDate: new Date(due + 'T12:00:00') } : {}),
        ...(nextStep.trim() ? { nextStep: nextStep.trim() } : {}),
        ...(scope.trim() ? { scope: scope.trim() } : {}),
        ...(gatekeeper.trim() ? { gatekeeper: gatekeeper.trim() } : {}),
        ...(prize ? { prizeGbp: Number(prize) } : {}),
        ...(days ? { effortDays: Number(days) } : {}),
        ...(opportunity ? { opportunity: Math.min(5, Math.max(1, Number(opportunity))) } : {}),
        checklist: steps
          .split('\n')
          .map((l) => l.replace(/^\s*[-•*•]\s*/, '').trim())
          .filter(Boolean)
          .map((text, i) => ({ id: `n${i}${Math.random().toString(36).slice(2, 8)}`, text, done: false })),
        updates: [{ at: new Date().toISOString(), text: 'Project created', kind: 'auto' as const }],
      }
      await createProject(data)
      toast.success(`${title.trim()} added`)
      onCreated()
      onClose()
    } catch (e) {
      toast.error(String(e))
    } finally { setSaving(false) }
  }

  const toggleAssignee = (name: string) =>
    setAssignees((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '760px', padding: '24px 26px 26px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>New project</h2>
            <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>
              Only the title is required — the rest can be filled in on the board.
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#d1d5db' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span style={label}>Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) create() }}
              placeholder="What is it?"
              style={{ ...input, fontSize: '15px', fontWeight: 600 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
            <div>
              <span style={label}>Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)} style={{ ...input, cursor: 'pointer' }}>
                {Object.entries(PROJECT_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Programme</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory)} style={{ ...input, cursor: 'pointer' }}>
                {PROJECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Where</span>
              <select value={location} onChange={(e) => setLocation(e.target.value as ProjectLocation)} style={{ ...input, cursor: 'pointer' }}>
                {PROJECT_LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Stage</span>
              <select value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)} style={{ ...input, cursor: 'pointer' }}>
                {PROJECT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Due</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...input, fontFamily: 'monospace' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <span style={label}>Owner — one name, accountable</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">Nobody yet</option>
                {users.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
              </select>
              {users.length === 0 && (
                <p style={{ fontSize: '11.5px', color: '#b45309', margin: '5px 0 0' }}>
                  No people on the platform yet — add them in Settings.
                </p>
              )}
            </div>
            <div>
              <span style={label}>Client or account</span>
              <input
                list="project-accounts"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Optional"
                style={input}
              />
              <datalist id="project-accounts">
                {accounts.map((a) => <option key={a.id} value={a.tradingName || a.legalName} />)}
              </datalist>
            </div>
          </div>

          {users.length > 0 && (
            <div>
              <span style={label}>Also on it</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {users.filter((u) => u.displayName !== owner).map((u) => {
                  const on = assignees.includes(u.displayName)
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleAssignee(u.displayName)}
                      style={{
                        border: '1px solid', borderColor: on ? '#111827' : '#e5e7eb',
                        background: on ? '#111827' : '#fff', color: on ? '#fff' : '#4b5563',
                        borderRadius: '20px', padding: '4px 11px', fontSize: '12.5px', cursor: 'pointer',
                      }}
                    >{u.displayName}</button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <span style={label}>Scope — what done looks like</span>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={3}
              placeholder="The deliverable, the standard it has to hit, and what is explicitly out."
              style={{ ...input, resize: 'vertical', lineHeight: 1.55 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <span style={label}>Next step</span>
              <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="The very next thing" style={input} />
            </div>
            <div>
              <span style={label}>Gatekeeper — who has to say yes</span>
              <input value={gatekeeper} onChange={(e) => setGatekeeper(e.target.value)} placeholder="Optional" style={input} />
            </div>
          </div>

          <div>
            <span style={label}>To do — one per line</span>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              placeholder={'Brief Dima\nFirst tasting\nSign-off with Mark'}
              style={{ ...input, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <span style={label}>Prize — £/yr if it lands</span>
              <input value={prize} onChange={(e) => setPrize(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }} />
            </div>
            <div>
              <span style={label}>Opportunity 1–5</span>
              <input value={opportunity} onChange={(e) => setOpportunity(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }} />
            </div>
            <div>
              <span style={label}>Bench days</span>
              <input value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" style={{ ...input, textAlign: 'right', fontFamily: 'monospace' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '22px' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={saving || !title.trim()}>Create project</Button>
        </div>
      </div>
    </div>
  )
}
