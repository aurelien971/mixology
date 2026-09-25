'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import RecipeEditor, { RecipeDraft } from '@/components/recipes/RecipeEditor'
import { Product } from '@/types'
import toast from 'react-hot-toast'

/**
 * Several bar specs from one screenshot. The AI reads every drink it can see,
 * then this walks you through them one at a time — ingredients matched, each
 * recipe saved before the next one opens.
 */

interface Img { name: string; media_type: string; data: string; preview: string }

interface SpecLine { name: string; amount: number; unit: 'ml' | 'cl' | 'g' | 'kg' | 'unit' | 'dash' }
interface Spec {
  name: string
  variation: string | null
  serveMl: number
  glass: string | null
  ice: string | null
  garnish: string | null
  method: string | null
  notes: string | null
  ingredients: SpecLine[]
}

async function fileToImg(file: File): Promise<Img> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const data = btoa(binary)
  return { name: file.name, media_type: file.type || 'image/png', data, preview: `data:${file.type};base64,${data}` }
}

// A dash is about 1ml, which is close enough for a bitters line.
const BASE: Record<SpecLine['unit'], { litres: number; base: 'L' | 'KG' | 'UNIT' }> = {
  ml: { litres: 0.001, base: 'L' }, cl: { litres: 0.01, base: 'L' }, dash: { litres: 0.001, base: 'L' },
  g: { litres: 0.001, base: 'KG' }, kg: { litres: 1, base: 'KG' }, unit: { litres: 1, base: 'UNIT' },
}

function toDraft(s: Spec): RecipeDraft {
  const batch = s.serveMl > 0 ? s.serveMl / 1000 : 0.1
  const lines = s.ingredients.filter((i) => i.amount > 0)
  const notes = [
    s.glass || s.ice || s.garnish ? `Glass ${s.glass ?? '—'} · Ice ${s.ice ?? '—'} · Garnish ${s.garnish ?? '—'}` : '',
    s.method ?? '',
    s.notes ? `Note: ${s.notes}` : '',
    s.ingredients.filter((i) => !(i.amount > 0)).length
      ? `Written with no measure: ${s.ingredients.filter((i) => !(i.amount > 0)).map((i) => i.name).join(', ')}`
      : '',
  ].filter(Boolean).join('\n')
  return {
    name: s.name,
    variation: s.variation ?? undefined,
    batchLitres: batch,
    ingredients: lines.map((i) => {
      const b = BASE[i.unit] ?? BASE.ml
      const per1L = Math.round((i.amount * b.litres / batch) * 10000) / 10000
      return { name: i.name, unit: b.base, qtyPer1L: per1L, qtyPer1000L: Math.round(per1L * 1000 * 10000) / 10000 }
    }),
    analyticalValues: [],
    cookingInstructions: notes,
  }
}

export default function MultiRecipeImport({ products, onDone, onClose }: {
  products: Product[]
  onDone: () => void
  onClose: () => void
}) {
  const [images, setImages] = useState<Img[]>([])
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [specs, setSpecs] = useState<Spec[]>([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [editing, setEditing] = useState(false)

  async function addFiles(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    if (!list.length) { toast.error('Only images (screenshots or photos) here'); return }
    const imgs = await Promise.all(list.map(fileToImg))
    setImages((prev) => [...prev, ...imgs].slice(0, 10))
  }

  // Cmd+V drops a copied screenshot straight in.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      addFiles(files.map((f, i) => new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type })))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  async function analyze() {
    if (!images.length) return
    setParsing(true)
    try {
      const res = await fetch('/api/ai/parse-bar-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: images.map((i) => ({ media_type: i.media_type, data: i.data })) }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `API error ${res.status}`)
      const found = (json.recipes ?? []) as Spec[]
      if (!found.length) { toast.error('No drinks found in these images'); return }
      setSpecs(found)
      toast.success(`${found.length} drink${found.length === 1 ? '' : 's'} read — check them one at a time`)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Could not read the images')
    } finally { setParsing(false) }
  }

  function next(kind: 'saved' | 'skipped') {
    const s = specs[index]
    if (kind === 'saved') setDone((d) => [...d, s.name]); else setSkipped((d) => [...d, s.name])
    setEditing(false)
    setIndex((i) => i + 1)
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  }
  const panel: React.CSSProperties = { background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }
  const spec = specs[index]

  // One recipe open in the full editor, with the queue's progress on top.
  if (spec && editing) {
    return (
      <>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 70, background: '#111827', color: '#fff', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '13px' }}>
          <strong>Recipe {index + 1} of {specs.length}: {spec.name}</strong>
          <span style={{ opacity: 0.7 }}>{done.length} saved · {skipped.length} skipped</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => next('skipped')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', cursor: 'pointer' }}>Skip this one</button>
        </div>
        <RecipeEditor
          key={`${spec.name}-${index}`}
          draft={toDraft(spec)}
          products={products}
          onSaved={() => next('saved')}
          onClose={() => setEditing(false)}
        />
      </>
    )
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && !parsing) onClose() }}>
      <div style={panel}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Import several recipes</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
              Drop a screenshot of a spec sheet — the AI reads every drink on it, then you confirm them one at a time
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Step 1 — images */}
          {specs.length === 0 && (
            <>
              <label
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '34px 20px', borderRadius: '12px', cursor: 'pointer', gap: '6px',
                  border: `2px dashed ${dragging ? '#111827' : '#d1d5db'}`, background: dragging ? '#f9fafb' : '#fff',
                }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: 0 }}>Drop the spec sheet here, or click to browse</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Up to 10 images · or press Cmd+V to paste · several drinks per image is the point</p>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
              </label>

              {images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt={img.name} style={{ width: '96px', height: '68px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <button onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                        style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: '#111827', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
                <Button variant="secondary" onClick={onClose} disabled={parsing}>Cancel</Button>
                <Button onClick={analyze} loading={parsing} disabled={!images.length || parsing}>
                  {parsing ? 'Reading the specs…' : `Read ${images.length || ''} image${images.length === 1 ? '' : 's'}`}
                </Button>
              </div>
            </>
          )}

          {/* Step 2 — the queue */}
          {specs.length > 0 && index < specs.length && (
            <>
              <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 12px' }}>
                <strong>{specs.length} drinks</strong> read. Open each one, confirm every ingredient against our library, and save. Next opens straight after.
              </p>
              <div style={{ border: '1px solid #f3f4f6', borderRadius: '12px', overflow: 'hidden' }}>
                {specs.map((s, i) => {
                  const state = done.includes(s.name) ? 'done' : skipped.includes(s.name) ? 'skipped' : i === index ? 'now' : 'waiting'
                  return (
                    <div key={`${s.name}-${i}`} style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                      borderTop: i ? '1px solid #f3f4f6' : undefined, background: state === 'now' ? '#f9fafb' : '#fff',
                    }}>
                      <span style={{
                        width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700,
                        background: state === 'done' ? '#dcfce7' : state === 'skipped' ? '#f3f4f6' : state === 'now' ? '#111827' : '#f3f4f6',
                        color: state === 'done' ? '#166534' : state === 'now' ? '#fff' : '#9ca3af',
                      }}>{state === 'done' ? '✓' : state === 'skipped' ? '–' : i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#111827' }}>{s.name}</span>
                        <span style={{ display: 'block', fontSize: '11.5px', color: '#9ca3af' }}>
                          {s.ingredients.filter((x) => x.amount > 0).length} ingredients · {s.serveMl || '?'}ml serve
                          {s.variation ? ` · ${s.variation}` : ''}
                        </span>
                      </div>
                      {state === 'now' && <Button size="sm" onClick={() => setEditing(true)}>Open recipe {i + 1}</Button>}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                <Button variant="ghost" size="sm" onClick={() => next('skipped')}>Skip {specs[index]?.name}</Button>
                <Button onClick={() => setEditing(true)}>Open {specs[index]?.name}</Button>
              </div>
            </>
          )}

          {/* Step 3 — finished */}
          {specs.length > 0 && index >= specs.length && (
            <div style={{ textAlign: 'center', padding: '18px 0' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>
                {done.length} of {specs.length} saved
              </p>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0' }}>
                {skipped.length ? `Skipped: ${skipped.join(', ')}` : 'Every drink on the sheet is in.'}
              </p>
              <div style={{ marginTop: '16px' }}>
                <Button onClick={() => { onDone(); onClose() }}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
