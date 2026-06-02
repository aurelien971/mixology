'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getRecipes, createRecipe } from '@/lib/firestore/recipes'
import { getProducts } from '@/lib/firestore/catalog'
import { Recipe, RecipeIngredient, RecipeAnalytical, Product } from '@/types'
import toast from 'react-hot-toast'

// ── Excel parser — xlsx loaded dynamically only when a file is uploaded ───────
// ── AI-powered parser — sends raw sheet text to Claude for extraction ─────────
async function parseSheetWithAI(sheetText: string): Promise<Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> | null> {
  const res = await fetch('/api/parse-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetText }),
  })

  const data = await res.json()

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `API error ${res.status}`)
  }

  const text  = data.text ?? ''
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    if (!parsed.name) return null
    return {
      name:               parsed.name,
      variation:          parsed.variation   ?? undefined,
      version:            parsed.version     ?? undefined,
      createdBy:          parsed.createdBy   ?? undefined,
      dateCreated:        parsed.dateCreated ?? undefined,
      ingredients:        parsed.ingredients ?? [],
      analyticalValues:   parsed.analyticalValues ?? [],
      cookingInstructions: parsed.cookingInstructions ?? '',
      status: 'active' as const,
    }
  } catch (e) {
    console.error('JSON parse failed:', clean, e)
    return null
  }
}

async function parseExcelRecipes(
  buffer: ArrayBuffer,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>[]> {
  const XLSX = await import('xlsx')
  const wb   = XLSX.read(buffer, { type: 'array' })
  const results: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>[] = []

  for (let i = 0; i < wb.SheetNames.length; i++) {
    const sheetName = wb.SheetNames[i]
    onProgress?.(i, wb.SheetNames.length, sheetName)
    const ws  = wb.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(ws)
    if (!csv.trim()) continue
    const recipe = await parseSheetWithAI(csv)
    if (recipe) results.push(recipe)
  }

  onProgress?.(wb.SheetNames.length, wb.SheetNames.length, '')
  return results
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecipesPage() {
  const [recipes, setRecipes]   = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(true)
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed]     = useState<Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>[] | null>(null)
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')
  const [parsing, setParsing]   = useState(false)
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, currentName: '' })

  useEffect(() => {
    Promise.all([getRecipes(), getProducts()])
      .then(([r, p]) => { setRecipes(r); setProducts(p) })
      .finally(() => setLoading(false))
  }, [])

  async function handleFile(file: File) {
    try {
      setParsing(true)
      setParsed(null)
      const buf = await file.arrayBuffer()
      const results = await parseExcelRecipes(buf, (current, total, name) => {
        setParseProgress({ current, total, currentName: name })
      })
      if (results.length === 0) { toast.error('No recipes found — check the file format'); return }
      setParsed(results)
      toast.success(`${results.length} recipe${results.length !== 1 ? 's' : ''} extracted!`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to parse file')
    } finally {
      setParsing(false)
    }
  }

  async function saveAll() {
    if (!parsed) return
    setSaving(true)
    try {
      for (const recipe of parsed) {
        await createRecipe(recipe)
      }
      toast.success(`${parsed.length} recipes saved!`)
      setParsed(null)
      const updated = await getRecipes()
      setRecipes(updated)
    } catch (e) {
      console.error(e)
      toast.error('Failed to save recipes')
    } finally {
      setSaving(false)
    }
  }

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.variation ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Header
        title="Recipes"
        subtitle="Master recipe file"
        action={
          <label style={{ cursor: 'pointer' }}>
            <Button size="sm" variant="secondary" onClick={() => {}}>↑ Upload Excel</Button>
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        }
      />

      {/* Parsing progress */}
      {parsing && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '28px 32px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', margin: '0 auto 16px', borderRadius: '50%', border: '3px solid #f3f4f6', borderTopColor: '#111827', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 6px' }}>
            Extracting recipes with AI...
          </p>
          {parseProgress.total > 0 && (
            <>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }}>
                Recipe {parseProgress.current + 1} of {parseProgress.total}: <strong>{parseProgress.currentName}</strong>
              </p>
              <div style={{ background: '#f3f4f6', borderRadius: '4px', height: '6px', maxWidth: '300px', margin: '0 auto' }}>
                <div style={{ background: '#111827', height: '100%', borderRadius: '4px', transition: 'width 0.3s', width: `${((parseProgress.current) / parseProgress.total) * 100}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Upload / drop zone — shown when no recipes yet */}
      {recipes.length === 0 && !parsed && !loading && !parsing && (
        <label
          onDrop={e => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 32px', borderRadius: '14px', cursor: 'pointer',
            border: `2px dashed ${dragging ? '#111827' : '#d1d5db'}`,
            background: dragging ? '#f9fafb' : '#fff', gap: '12px', marginBottom: '20px',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M16 4v16M8 12l8-8 8 8M4 24h24" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#374151', margin: 0 }}>Drop your Master Recipe Excel here</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>or click to browse — supports .xlsx</p>
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
      )}

      {/* Parsed preview */}
      {parsed && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>✓ {parsed.length} recipes parsed from Excel</p>
              <p style={{ fontSize: '12px', color: '#4b7c5e', margin: 0 }}>Review below — you can link them to catalog products after saving</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => setParsed(null)}>Discard</Button>
              <Button size="sm" onClick={saveAll} loading={saving}>Save all {parsed.length} recipes</Button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {parsed.map((r, i) => (
              <div key={i} style={{ padding: '6px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '13px', color: '#166534', fontWeight: 500 }}>
                {r.name}
                {r.variation && <span style={{ color: '#9ca3af', fontWeight: 400 }}> · {r.variation}</span>}
                <span style={{ marginLeft: '6px', color: '#9ca3af', fontSize: '11px' }}>{r.ingredients.length} ingredients</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      {recipes.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes..."
            style={{ width: '280px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
          />
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{filtered.length} recipe{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Recipe grid */}
      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {filtered.map(r => {
            const linkedProduct = products.find(p => p.id === r.productId)
            return (
              <Link key={r.id} href={`/recipes/${r.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#f3f4f6')}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{r.name}</p>
                      {r.variation && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{r.variation}</p>}
                    </div>
                    {r.version && (
                      <span style={{ fontSize: '11px', color: '#9ca3af', background: '#f9fafb', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>v{r.version}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    <span>🧪 {r.ingredients.length} ingredients</span>
                    {r.createdBy && <span>👤 {r.createdBy}</span>}
                  </div>
                  {linkedProduct ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#eff6ff', borderRadius: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8', fontFamily: 'monospace' }}>{linkedProduct.productCode}</span>
                      <span style={{ fontSize: '11px', color: '#3b82f6' }}>{linkedProduct.name}</span>
                    </div>
                  ) : (
                    <p style={{ fontSize: '11px', color: '#d1d5db', margin: 0 }}>No product linked</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}