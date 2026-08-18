'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { RecipeDraft } from '@/components/recipes/RecipeEditor'
import toast from 'react-hot-toast'

interface Img { name: string; media_type: string; data: string; preview: string }

async function fileToImg(file: File): Promise<Img> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  const data = btoa(binary)
  return { name: file.name, media_type: file.type || 'image/png', data, preview: `data:${file.type};base64,${data}` }
}

export default function ScreenshotImport({ onParsed, onClose }: {
  onParsed: (drafts: RecipeDraft[]) => void
  onClose: () => void
}) {
  const [images, setImages] = useState<Img[]>([])
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function addFiles(files: FileList | File[]) {
    const list = [...files].filter(f => f.type.startsWith('image/'))
    if (!list.length) { toast.error('Only images (screenshots) are supported here'); return }
    const imgs = await Promise.all(list.map(fileToImg))
    setImages(prev => [...prev, ...imgs].slice(0, 10))
  }

  async function analyze() {
    if (!images.length) return
    setParsing(true)
    try {
      const res = await fetch('/api/ai/parse-recipe-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: images.map(i => ({ media_type: i.media_type, data: i.data })) }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `API error ${res.status}`)
      const recipes = (json.recipes ?? []) as Array<{
        name: string; variation?: string | null; version?: string | null; createdBy?: string | null; dateCreated?: string | null
        ingredients: { name: string; unit: string; qtyPer1000L: number; qtyPer1L: number }[]
        analyticalValues: { name: string; min?: number | null; target?: number | null; max?: number | null; notes?: string | null }[]
        cookingInstructions: string
      }>
      if (!recipes.length) { toast.error('No recipes found in these screenshots'); return }
      const drafts: RecipeDraft[] = recipes.map(r => ({
        name: r.name,
        variation: r.variation ?? undefined,
        version: r.version ?? undefined,
        createdBy: r.createdBy ?? undefined,
        dateCreated: r.dateCreated ?? undefined,
        ingredients: r.ingredients.map(i => ({
          name: i.name, unit: i.unit || 'KG',
          qtyPer1000L: i.qtyPer1000L, qtyPer1L: i.qtyPer1L,
        })),
        analyticalValues: r.analyticalValues.map(a => {
          const row: { name: string; min?: number; target?: number; max?: number; notes?: string } = { name: a.name }
          if (a.min != null) row.min = a.min
          if (a.target != null) row.target = a.target
          if (a.max != null) row.max = a.max
          if (a.notes) row.notes = a.notes
          return row
        }),
        cookingInstructions: r.cookingInstructions ?? '',
      }))
      toast.success(`${drafts.length} recipe${drafts.length !== 1 ? 's' : ''} extracted — review before saving`)
      onParsed(drafts)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to analyze screenshots')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={e => { if (e.target === e.currentTarget && !parsing) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', border: '1px solid #e5e7eb' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Import recipe from screenshots</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>Screenshot your Google Sheet recipe(s) and drop them here — AI reads everything</p>
          </div>
          <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <label
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '32px 20px', borderRadius: '12px', cursor: 'pointer', gap: '8px',
              border: `2px dashed ${dragging ? '#111827' : '#d1d5db'}`, background: dragging ? '#f9fafb' : '#fff',
            }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="6" width="24" height="20" rx="3" stroke="#9ca3af" strokeWidth="2" fill="none"/>
              <circle cx="12" cy="13" r="2.5" fill="#9ca3af"/>
              <path d="M6 24l7-7 5 5 4-4 4 4" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: 0 }}>Drop screenshots here or click to browse</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>One or several — up to 10 images (PNG / JPG)</p>
            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => e.target.files && addFiles(e.target.files)} />
          </label>

          {images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt={img.name} style={{ width: '96px', height: '68px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <button onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: '#111827', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={parsing}>Cancel</Button>
          <Button onClick={analyze} loading={parsing} disabled={!images.length}>
            {parsing ? 'Reading screenshots…' : `Analyze ${images.length || ''} screenshot${images.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
