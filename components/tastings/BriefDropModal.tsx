'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/ui/Button'
import { Account, Ingredient } from '@/types'
import { StaffUser } from '@/lib/firestore/staffUsers'
import { ParsedBrief, importBrief, tastingDate, toRecipeLines, serveVolume } from '@/lib/briefImport'
import toast from 'react-hot-toast'

interface Props {
  accounts: Account[]
  ingredients: Ingredient[]
  staff: StaffUser[]
  onClose: () => void
  onSaved: () => void
}

const label: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: '7px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const kicker: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px',
}

type Attachment =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'image'; name: string; media_type: string; data: string; preview: string }
  | { kind: 'pdf'; name: string; data: string }

const SHEET = /\.(xlsx|xlsm|xls|ods|csv)$/i
const TEXT = /\.(txt|eml|md)$/i
const MAX_TEXT = 60000
const MAX_EDGE = 1800

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

// Photos are shrunk before sending, the same as the delivery upload.
function shrinkImage(file: File): Promise<{ media_type: string; data: string; preview: string } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const preview = canvas.toDataURL('image/jpeg', 0.9)
      resolve({ media_type: 'image/jpeg', data: preview.split(',')[1] ?? '', preview })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

/** Whatever was dropped, in a shape the brief reader accepts. */
async function readFile(file: File): Promise<Attachment | null> {
  if (SHEET.test(file.name)) {
    // Spreadsheets are flattened to CSV per sheet — the model reads a table
    // perfectly well as text, and it keeps every cell rather than a screenshot.
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const text = wb.SheetNames
      .map((n) => `--- sheet: ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`)
      .join('\n\n')
      .slice(0, MAX_TEXT)
    return { kind: 'text', name: file.name, text }
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { kind: 'pdf', name: file.name, data: await toBase64(file) }
  }
  if (file.type.startsWith('image/')) {
    const img = await shrinkImage(file)
    return img ? { kind: 'image', name: file.name, ...img } : null
  }
  if (file.type.startsWith('text/') || TEXT.test(file.name)) {
    return { kind: 'text', name: file.name, text: (await file.text()).slice(0, MAX_TEXT) }
  }
  return null
}

const EVENT_TONE: Record<string, { bg: string; fg: string }> = {
  trial:    { bg: '#ffedd5', fg: '#c2410c' },
  tasting:  { bg: '#dbeafe', fg: '#1d4ed8' },
  launch:   { bg: '#dcfce7', fg: '#166534' },
  deadline: { bg: '#fee2e2', fg: '#991b1b' },
  other:    { bg: '#f3f4f6', fg: '#4b5563' },
}

export default function BriefDropModal({ accounts, ingredients, staff, onClose, onSaved }: Props) {
  const [email, setEmail] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [brief, setBrief] = useState<ParsedBrief | null>(null)

  // review choices
  const [accountId, setAccountId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [keep, setKeep] = useState<Record<number, boolean>>({})
  const [tastingOn, setTastingOn] = useState('')
  const [owner, setOwner] = useState('')
  const [makeRecipes, setMakeRecipes] = useState(true)
  const [makeTasting, setMakeTasting] = useState(true)
  const [makeProject, setMakeProject] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function add(list: FileList | File[]) {
    const read = await Promise.all([...list].map(readFile))
    const ok = read.filter((a): a is Attachment => a !== null)
    if (ok.length < read.length) toast.error('Some files were skipped — spreadsheets, PDFs, images and text only')
    setFiles((prev) => [...prev, ...ok])
  }

  async function read() {
    if (!email.trim() && !files.length) return
    setReading(true)
    try {
      const res = await fetch('/api/ai/parse-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailText: email,
          today: format(new Date(), 'yyyy-MM-dd (EEEE)'),
          texts: files.filter((f) => f.kind === 'text').map((f) => ({ name: f.name, text: f.kind === 'text' ? f.text : '' })),
          images: files.flatMap((f) => (f.kind === 'image' ? [{ name: f.name, media_type: f.media_type, data: f.data }] : [])),
          pdfs: files.flatMap((f) => (f.kind === 'pdf' ? [{ name: f.name, data: f.data }] : [])),
          accounts: accounts.map((a) => ({ id: a.id, name: a.tradingName || a.legalName })),
          ingredients: ingredients.map((i) => ({ id: i.id, name: i.name })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `API error ${res.status}`)
      const parsed = json as ParsedBrief
      setBrief(parsed)
      const matched = accounts.find((a) => a.id === parsed.account.matchedAccountId)
      setAccountId(matched?.id ?? '')
      setAccountName(matched ? (matched.tradingName || matched.legalName) : parsed.account.name)
      setKeep(Object.fromEntries(parsed.drinks.map((_, i) => [i, true])))
      setTastingOn(tastingDate(parsed.events)?.date ?? '')
      if (!parsed.drinks.length) toast('No drinks found — check the warnings', { icon: '⚠️' })
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Could not read the brief')
    } finally { setReading(false) }
  }

  async function create() {
    if (!brief) return
    const drinks = brief.drinks.filter((_, i) => keep[i])
    if (!drinks.length) return toast.error('Tick at least one drink')
    const name = accountId ? (accounts.find((a) => a.id === accountId)?.tradingName || accountName) : accountName.trim()
    if (!name) return toast.error('Who is this for?')
    setSaving(true)
    try {
      const r = await importBrief(brief, {
        drinks,
        accountId: accountId || undefined,
        accountName: name,
        createRecipes: makeRecipes,
        createTasting: makeTasting,
        createProject: makeProject,
        tastingOn: tastingOn || undefined,
        owner: owner || undefined,
        source: files.map((f) => f.name).join(', ') || 'email',
      })
      toast.success([
        `${r.productsCreated} drink${r.productsCreated === 1 ? '' : 's'} added`,
        r.productsReused ? `${r.productsReused} already existed` : null,
        r.recipesCreated ? `${r.recipesCreated} draft recipe${r.recipesCreated === 1 ? '' : 's'}` : null,
        r.tastingId ? 'tasting booked' : null,
        r.projectId ? 'project created' : null,
      ].filter(Boolean).join(' · '), { duration: 6000 })
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Stopped part-way — check what was created before running it again')
    } finally { setSaving(false) }
  }

  const kept = brief ? brief.drinks.filter((_, i) => keep[i]).length : 0

  return (
    <div
      onClick={() => { if (!reading && !saving) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '880px', padding: '24px 26px 26px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>
              {brief ? 'Check what was read' : 'Drop a brief'}
            </h2>
            <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>
              {brief
                ? 'Nothing has been created yet. Untick anything wrong, then create it all in one go.'
                : 'Paste the email and drop the attachments — specs, menus, photos. It finds the client, the dates and the drinks.'}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#d1d5db' }}>×</button>
        </div>

        {!brief ? (
          <>
            <span style={label}>The email</span>
            <textarea
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              rows={5}
              placeholder={'Hey guys —\nWe got the list from Tom now for the bespoke drinks at SSB.\nLet’s get working on this, also on the pricing.\nTrial service is September 28!'}
              style={{ ...input, resize: 'vertical', lineHeight: 1.55 }}
            />

            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}
              style={{
                display: 'block', marginTop: '14px', padding: '26px 20px', textAlign: 'center', cursor: 'pointer',
                borderRadius: '10px', border: `1.5px dashed ${dragging ? '#111827' : '#e5e7eb'}`,
                background: dragging ? '#f9fafb' : '#fcfcfd',
              }}
            >
              <input type="file" multiple style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
              <p style={{ margin: '0 0 3px', fontSize: '13.5px', fontWeight: 600, color: '#374151' }}>
                Drop the attachments here, or click to choose
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                Excel or CSV spec sheets, PDF menus, photos, text
              </p>
            </label>

            {files.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                {files.map((f, i) => (
                  <span key={f.name + i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 10px',
                    border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', color: '#374151',
                  }}>
                    {f.kind === 'image'
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={f.preview} alt="" style={{ width: '22px', height: '22px', objectFit: 'cover', borderRadius: '4px' }} />
                      : <span>{f.kind === 'pdf' ? '📄' : '📊'}</span>}
                    {f.name}
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, fontSize: '14px' }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <Button variant="ghost" onClick={onClose} disabled={reading}>Cancel</Button>
              <Button onClick={read} loading={reading} disabled={reading || (!email.trim() && !files.length)}>
                {reading ? 'Reading the brief…' : 'Read it'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: '#374151', lineHeight: 1.6 }}>{brief.summary}</p>

            {brief.warnings && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '9px', padding: '10px 13px', marginBottom: '14px' }}>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#92400e', lineHeight: 1.5 }}>⚠ {brief.warnings}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <span style={label}>For</span>
                <select
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value)
                    const a = accounts.find((x) => x.id === e.target.value)
                    if (a) setAccountName(a.tradingName || a.legalName)
                  }}
                  style={{ ...input, cursor: 'pointer' }}
                >
                  <option value="">A prospect — {accountName || 'type below'}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.tradingName || a.legalName}</option>)}
                </select>
                {!accountId && (
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Venue name" style={{ ...input, marginTop: '6px' }} />
                )}
              </div>
              <div>
                <span style={label}>Tasting on</span>
                <input type="date" value={tastingOn} onChange={(e) => setTastingOn(e.target.value)} style={input} />
              </div>
              <div>
                <span style={label}>Owner</span>
                <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                  <option value="">—</option>
                  {staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
                </select>
              </div>
            </div>

            {brief.events.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <p style={kicker}>Dates in the brief</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {brief.events.map((e, i) => {
                    const tone = EVENT_TONE[e.kind] ?? EVENT_TONE.other
                    const on = tastingOn === e.date
                    return (
                      <button
                        key={e.date + i}
                        onClick={() => setTastingOn(e.date)}
                        title="Put the tasting on this date"
                        style={{
                          border: `1px solid ${on ? tone.fg : 'transparent'}`, background: tone.bg, color: tone.fg,
                          borderRadius: '8px', padding: '6px 11px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {e.label} · {format(new Date(e.date + 'T12:00:00'), 'EEE d MMM')}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ ...kicker, margin: 0 }}>{kept} of {brief.drinks.length} drinks</p>
                {brief.pricingRequested && (
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#fef3c7', color: '#92400e' }}>
                    Pricing requested
                  </span>
                )}
              </div>
              {brief.drinks.map((d, i) => {
                const { unconverted } = toRecipeLines(d)
                const matched = d.ingredients.filter((l) => l.matchedIngredientId).length
                const isOpen = open === i
                return (
                  <div key={d.name + i} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px' }}>
                      <input type="checkbox" checked={!!keep[i]} onChange={(e) => setKeep({ ...keep, [i]: e.target.checked })} />
                      <button
                        onClick={() => setOpen(isOpen ? null : i)}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', flex: 1 }}
                      >
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827' }}>{d.name}</span>
                        <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>
                          {d.ingredients.length} lines · {Math.round(serveVolume(d)) || '?'}ml
                          {d.glass ? ` · ${d.glass}` : ''}
                        </span>
                      </button>
                      <span style={{ fontSize: '11px', color: matched === d.ingredients.length ? '#166534' : '#9ca3af' }}>
                        {matched}/{d.ingredients.length} in stock take
                      </span>
                      {unconverted.length > 0 && (
                        <span title={`Check by hand: ${unconverted.join(', ')}`} style={{ fontSize: '11px', fontWeight: 700, color: '#b45309' }}>
                          {unconverted.length} to check
                        </span>
                      )}
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 14px 12px 40px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <tbody>
                            {d.ingredients.map((l, j) => {
                              const ing = ingredients.find((x) => x.id === l.matchedIngredientId)
                              return (
                                <tr key={l.name + j} style={{ borderTop: j ? '1px solid #fafafa' : 'none' }}>
                                  <td style={{ padding: '4px 10px 4px 0', color: '#374151' }}>{l.name}</td>
                                  <td style={{ padding: '4px 10px', textAlign: 'right', color: '#6b7280', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                    {l.amount ?? '—'} {l.unit}
                                  </td>
                                  <td style={{ padding: '4px 0', textAlign: 'right', fontSize: '11.5px', color: ing ? '#166534' : '#d1d5db' }}>
                                    {ing ? `→ ${ing.name}` : 'not in stock take'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {(d.method || d.garnish || d.notes) && (
                          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6b7280', lineHeight: 1.55 }}>
                            {[d.method, d.garnish && `Garnish: ${d.garnish}`, d.notes].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px' }}>
              <p style={kicker}>Create</p>
              {[
                { on: true, set: () => {}, locked: true, t: `${kept} drink${kept === 1 ? '' : 's'} in the catalog`, s: 'Category Bespoke, next product codes. Existing names are reused, not duplicated.' },
                { on: makeRecipes, set: setMakeRecipes, t: 'Draft recipes', s: 'Converted from per serve to per litre, linked to the stock take where matched. Marked draft.' },
                { on: makeTasting, set: setMakeTasting, t: 'A tasting', s: tastingOn ? `On ${format(new Date(tastingOn + 'T12:00:00'), 'EEE d MMM')} — shows in the calendar.` : 'No date yet — it will sit in Requested.' },
                { on: makeProject, set: setMakeProject, t: 'A project', s: 'Checklist: spec and cost each drink, pricing, every date in the brief.' },
              ].map((o) => (
                <label key={o.t} style={{ display: 'flex', gap: '10px', padding: '6px 0', cursor: o.locked ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={o.on} disabled={o.locked} onChange={(e) => o.set(e.target.checked)} style={{ marginTop: '3px' }} />
                  <span>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#111827' }}>{o.t}</span>
                    <span style={{ display: 'block', fontSize: '12px', color: '#9ca3af' }}>{o.s}</span>
                  </span>
                </label>
              ))}
            </div>

            {brief.nextSteps.length > 0 && (
              <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: '#6b7280' }}>
                <strong style={{ color: '#374151' }}>Next steps it picked up:</strong> {brief.nextSteps.join(' · ')}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <Button variant="ghost" onClick={() => setBrief(null)} disabled={saving}>← Back</Button>
              <Button onClick={create} loading={saving} disabled={saving || !kept}>
                {saving ? 'Creating…' : 'Create everything'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
