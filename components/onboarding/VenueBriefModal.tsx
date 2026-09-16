'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/ui/Button'
import { readFile, Attachment } from '@/components/tastings/BriefDropModal'
import { addMenuDrink } from '@/lib/firestore/menu'
import { ParsedBrief, tastingDate } from '@/lib/briefImport'
import { OVERLAP_LABEL, detectOverlap, classicProduct } from '@/lib/onboarding'
import { CORE_RANGE, DrinkSpec, MenuOverlap, normalizeDrinkName } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, input, kicker, Pill, money } from './shared'
import toast from 'react-hot-toast'

/**
 * Drop what a venue sent — the email, a menu, a costing sheet, bar specs — and
 * it becomes their menu. Drinks already on it are updated, not duplicated.
 */
export default function VenueBriefModal({ ctx, onClose }: { ctx: VenueCtx; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [brief, setBrief] = useState<ParsedBrief | null>(null)
  const [keep, setKeep] = useState<Record<number, boolean>>({})
  const [overlaps, setOverlaps] = useState<Record<number, { overlap: MenuOverlap; classicName?: string }>>({})
  const [tasting, setTasting] = useState('')
  const [saving, setSaving] = useState(false)

  const existingByName = (n: string) => ctx.drinks.find((d) => normalizeDrinkName(d.name) === normalizeDrinkName(n))

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
          texts: files.flatMap((f) => (f.kind === 'text' ? [{ name: f.name, text: f.text }] : [])),
          images: files.flatMap((f) => (f.kind === 'image' ? [{ name: f.name, media_type: f.media_type, data: f.data }] : [])),
          pdfs: files.flatMap((f) => (f.kind === 'pdf' ? [{ name: f.name, data: f.data }] : [])),
          accounts: ctx.accounts.map((a) => ({ id: a.id, name: a.tradingName || a.legalName })),
          ingredients: ctx.ingredients.map((i) => ({ id: i.id, name: i.name })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `API error ${res.status}`)
      const parsed = json as ParsedBrief
      setBrief(parsed)
      setKeep(Object.fromEntries(parsed.drinks.map((_, i) => [i, true])))
      setOverlaps(Object.fromEntries(parsed.drinks.map((d, i) => {
        const on = existingByName(d.name)
        return [i, on ? { overlap: on.overlap, classicName: on.classicName } : detectOverlap(d.name)]
      })))
      setTasting(tastingDate(parsed.events)?.date ?? ctx.venue.tastingDate ?? '')
      if (!parsed.drinks.length) toast('No drinks found — check the warnings', { icon: '⚠️' })
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Could not read the brief')
    } finally { setReading(false) }
  }

  async function apply() {
    if (!brief) return
    setSaving(true)
    const source = files.map((f) => f.name).join(', ') || 'email'
    let added = 0, updated = 0
    try {
      let order = Math.max(0, ...ctx.drinks.map((d) => d.order)) + 1
      for (const [i, bd] of brief.drinks.entries()) {
        if (!keep[i]) continue
        const ov = overlaps[i] ?? detectOverlap(bd.name)
        const spec: DrinkSpec | undefined = bd.ingredients.length
          ? { fromName: bd.name, serveMl: bd.serveMl, glass: bd.glass, garnish: bd.garnish, method: bd.method, notes: bd.notes, ingredients: bd.ingredients.map((l) => ({ name: l.name, amount: l.amount, unit: l.unit })) }
          : undefined
        const feedback = bd.notes?.match(/Feedback:\s*(.+?)(?:\.\s|$)/i)?.[1]?.trim()
        const on = existingByName(bd.name)
        if (on) {
          await ctx.patchDrink(on, {
            ...(spec ? { spec } : {}),
            ...(bd.menuPrice ? { menuPrice: bd.menuPrice } : {}),
            ...(bd.costPerServe ? { theirCost: bd.costPerServe } : {}),
            ...(bd.serveMl && !on.serveMl ? { serveMl: bd.serveMl } : {}),
            ...(feedback ? { feedback } : {}),
            ...(ov.overlap !== on.overlap || ov.classicName !== on.classicName ? { overlap: ov.overlap, classicName: ov.classicName } : {}),
          }, undefined, `Updated from a brief (${source})`)
          updated++
        } else {
          await addMenuDrink({
            venueId: ctx.venue.id,
            name: bd.name,
            order: order++,
            overlap: ov.overlap,
            classicName: ov.classicName,
            productId: ov.overlap === 'same' ? classicProduct(ov.classicName, ctx.products)?.id : undefined,
            format: bd.format === 'syrup' ? 'syrup' : 'premix',
            serveMl: bd.serveMl ?? undefined,
            menuPrice: bd.menuPrice ?? undefined,
            theirCost: bd.costPerServe ?? undefined,
            spec,
            feedback,
            firstLog: `From a brief (${source})`,
          })
          added++
        }
      }
      await ctx.patchVenue(
        {
          ...(tasting ? { tastingDate: tasting } : {}),
          brief: { summary: brief.summary, receivedAt: new Date().toISOString(), source, warnings: brief.warnings ?? undefined },
        },
        undefined,
        `Brief read (${source}): ${added} drink${added === 1 ? '' : 's'} added, ${updated} updated`
      )
      toast.success(`${added} added, ${updated} updated`)
      await ctx.reload()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Stopped part-way — check the menu before running it again')
    } finally { setSaving(false) }
  }

  const kept = brief ? brief.drinks.filter((_, i) => keep[i]).length : 0

  return (
    <div onClick={() => { if (!reading && !saving) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '900px', padding: '22px 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: INK }}>{brief ? 'Check what was read' : `Drop ${ctx.venue.name}'s brief`}</h2>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: MUTED }}>
              {brief ? 'Nothing is saved yet. Untick anything wrong, fix ours / new, then add it to the menu.' : 'The email plus whatever they attached — menu, costing sheet, bar specs, photos.'}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#d1d5db' }}>×</button>
        </div>

        {!brief ? (
          <>
            <span style={kicker}>The email</span>
            <textarea value={email} onChange={(e) => setEmail(e.target.value)} rows={4} placeholder={'We got the list from Tom for the bespoke drinks.\nLet’s get working on it, and the pricing.\nTasting is on the 28th.'}
              style={{ ...input, resize: 'vertical', lineHeight: 1.55 }} />
            <label onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}
              style={{ display: 'block', marginTop: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', borderRadius: '10px', border: `1.5px dashed ${dragging ? INK : '#e5e7eb'}`, background: dragging ? '#f9fafb' : '#fcfcfd' }}>
              <input type="file" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
              <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: '#374151' }}>Drop the attachments here, or click to choose</p>
            </label>
            {files.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                {files.map((f, i) => (
                  <span key={f.name + i} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', color: '#374151' }}>
                    {f.kind === 'pdf' ? '📄' : f.kind === 'image' ? '🖼' : '📊'} {f.name}
                    <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button variant="ghost" onClick={onClose} disabled={reading}>Cancel</Button>
              <Button onClick={read} loading={reading} disabled={reading || (!email.trim() && !files.length)}>{reading ? 'Reading…' : 'Read it'}</Button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', fontSize: '13.5px', color: INK, lineHeight: 1.55 }}>{brief.summary}</p>
            {brief.warnings && <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: '8px' }}>⚠ {brief.warnings}</p>}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span style={{ fontSize: '12.5px', color: SECONDARY }}>Tasting on</span>
              <input type="date" value={tasting} onChange={(e) => setTasting(e.target.value)} style={{ ...input, width: '160px', padding: '5px 8px', fontFamily: 'monospace' }} />
              {brief.events.map((ev, i) => (
                <button key={i} onClick={() => setTasting(ev.date)} style={{ border: `1px solid ${tasting === ev.date ? INK : '#e5e7eb'}`, background: '#fff', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: INK }}>
                  {ev.label} · {format(new Date(ev.date + 'T12:00:00'), 'EEE d MMM')}
                </button>
              ))}
            </div>
            <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', maxHeight: '420px', overflowY: 'auto' }}>
              {brief.drinks.map((bd, i) => {
                const ov = overlaps[i] ?? detectOverlap(bd.name)
                const on = existingByName(bd.name)
                return (
                  <div key={bd.name + i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderTop: i ? '1px solid #f9fafb' : 'none', flexWrap: 'wrap', opacity: keep[i] ? 1 : 0.45 }}>
                    <input type="checkbox" checked={!!keep[i]} onChange={(e) => setKeep({ ...keep, [i]: e.target.checked })} />
                    <span style={{ minWidth: '180px', flex: 1 }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: INK }}>{bd.name}</span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: MUTED }}>
                        {on ? 'on the menu — will be updated' : 'new to the menu'}
                        {bd.ingredients.length ? ` · spec ${bd.ingredients.length} lines` : ''}
                        {bd.menuPrice ? ` · ${money(bd.menuPrice)}` : ''}{bd.costPerServe ? ` · their cost ${money(bd.costPerServe)}` : ''}
                      </span>
                    </span>
                    <Pill bg={OVERLAP_LABEL[ov.overlap].bg} fg={OVERLAP_LABEL[ov.overlap].fg}>{OVERLAP_LABEL[ov.overlap].short}</Pill>
                    <select value={ov.overlap} onChange={(e) => setOverlaps({ ...overlaps, [i]: { overlap: e.target.value as MenuOverlap, classicName: e.target.value === 'none' ? undefined : ov.classicName } })}
                      style={{ ...input, width: 'auto', padding: '4px 6px', fontSize: '12px' }}>
                      <option value="same">Same as ours</option>
                      <option value="twist">Twist on ours</option>
                      <option value="none">New</option>
                    </select>
                    {ov.overlap !== 'none' && (
                      <select value={ov.classicName ?? ''} onChange={(e) => setOverlaps({ ...overlaps, [i]: { overlap: ov.overlap, classicName: e.target.value || undefined } })}
                        style={{ ...input, width: 'auto', padding: '4px 6px', fontSize: '12px' }}>
                        <option value="">Which?</option>
                        {CORE_RANGE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '16px' }}>
              <Button variant="ghost" onClick={() => setBrief(null)} disabled={saving}>← Back</Button>
              <Button onClick={apply} loading={saving} disabled={saving || !kept}>Put {kept} on the menu</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
