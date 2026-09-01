'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import RecipeEditor, { RecipeDraft } from '@/components/recipes/RecipeEditor'
import { getRecipes } from '@/lib/firestore/recipes'
import { getProducts, updateProduct } from '@/lib/firestore/catalog'
import { getIngredients } from '@/lib/firestore/ingredients'
import { getRecipeDrafts } from '@/lib/firestore/recipeDrafts'
import { computeRecipeCost } from '@/lib/costing'
import { Recipe, Product, Ingredient } from '@/types'
import toast from 'react-hot-toast'

export default function RecipesPage() {
  const [recipes, setRecipes]         = useState<Recipe[]>([])
  const [products, setProducts]       = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [range, setRange]             = useState<'all' | 'classics' | 'core'>('all')

  const [editorState, setEditorState] = useState<{ existing?: Recipe; draft?: RecipeDraft; presetProductId?: string } | null>(null)
  const [pendingDrafts, setPendingDrafts] = useState(0)

  function load() {
    Promise.all([getRecipes(), getProducts(), getIngredients()])
      .then(([r, p, i]) => { setRecipes(r); setProducts(p); setIngredients(i) })
      .finally(() => setLoading(false))
    getRecipeDrafts().then(d => setPendingDrafts(d.length)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const activeProducts = useMemo(() => products.filter(p => p.isActive !== false), [products])
  const missingRecipes = useMemo(
    () => activeProducts.filter(p => !recipes.some(r => r.productId === p.id)),
    [activeProducts, recipes]
  )

  // A recipe inherits its range from the product it is linked to — that is where
  // Classic and Core range are set, so there is only ever one place to change it.
  const productOf = (r: Recipe) => products.find(p => p.id === r.productId)

  const filtered = recipes.filter(r => {
    const q = search.toLowerCase()
    const matchSearch =
      r.name.toLowerCase().includes(q) ||
      (r.variation ?? '').toLowerCase().includes(q)
    const p = productOf(r)
    const matchRange =
      range === 'all' ? true :
      range === 'classics' ? !!p?.isClassic :
      !!p?.isCoreRange
    return matchSearch && matchRange
  })

  const classicCount = recipes.filter(r => productOf(r)?.isClassic).length
  const coreCount    = recipes.filter(r => productOf(r)?.isCoreRange).length

  return (
    <div>
      {editorState && (
        <RecipeEditor
          existing={editorState.existing}
          draft={editorState.draft}
          presetProductId={editorState.presetProductId}
          products={activeProducts}
          onSaved={() => { load() }}
          onClose={() => setEditorState(null)}
        />
      )}

      <Header
        title="Recipes"
        subtitle="Master recipe file — every drink, its ingredients and cost"
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/range">
              <Button size="sm" variant="secondary">★ Core classics</Button>
            </Link>
            <Link href="/recipes/fill">
              <Button size="sm" variant="secondary">◇ Fill the gaps</Button>
            </Link>
            <Button size="sm" onClick={() => setEditorState({})}>+ New recipe</Button>
          </div>
        }
      />

      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <>
          {/* Imported drafts awaiting approval */}
          {pendingDrafts > 0 && (
            <Link href="/recipes/review" style={{ textDecoration: 'none' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '14px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#1d4ed8', margin: 0 }}>
                    📋 {pendingDrafts} imported recipe{pendingDrafts !== 1 ? 's' : ''} waiting for your approval
                  </p>
                  <p style={{ fontSize: '12px', color: '#3b82f6', margin: '2px 0 0' }}>Extracted from the Cocktail Production blend sheets — review, tweak and approve</p>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8' }}>Review →</span>
              </div>
            </Link>
          )}

          {/* Missing recipes — the to-do list for Dima */}
          {missingRecipes.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#92400e', margin: 0 }}>
                  ⚠ {missingRecipes.length} drink{missingRecipes.length !== 1 ? 's' : ''} missing a recipe
                </p>
                <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>Click a drink, then fill it in or use “Fill from screenshot”</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {missingRecipes.map(p => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'stretch', background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', overflow: 'hidden' }}>
                    <button onClick={() => setEditorState({ presetProductId: p.id, draft: { name: p.name, ingredients: [], analyticalValues: [], cookingInstructions: '' } })}
                      style={{ padding: '6px 4px 6px 12px', background: 'transparent', border: 'none', fontSize: '13px', color: '#92400e', cursor: 'pointer', fontWeight: 500 }}>
                      + {p.name} <span style={{ color: '#d1d5db', fontFamily: 'monospace', fontSize: '11px' }}>{p.productCode}</span>
                    </button>
                    <button
                      title={`Remove ${p.name} from the platform`}
                      onClick={async e => {
                        e.stopPropagation()
                        if (!confirm(`Remove “${p.name}” (${p.productCode}) from the platform?\n\nIt disappears from the catalog, this list and pricing — past orders keep their numbers.`)) return
                        try {
                          await updateProduct(p.id, { isActive: false })
                          toast.success(`${p.name} removed`)
                          load()
                        } catch { toast.error('Failed to remove') }
                      }}
                      style={{ padding: '6px 10px 6px 6px', background: 'transparent', border: 'none', borderLeft: '1px solid #fef3c7', fontSize: '13px', color: '#d97706', cursor: 'pointer', lineHeight: 1 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#d97706')}
                    >×</button>
                  </span>
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
              <div style={{ display: 'flex', gap: '4px' }}>
                {([
                  ['all', `All ${recipes.length}`],
                  ['classics', `Classics ${classicCount}`],
                  ['core', `Core ${coreCount}`],
                ] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setRange(v)}
                    style={{
                      padding: '6px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                      border: 'none', cursor: 'pointer',
                      background: range === v ? '#111827' : 'transparent',
                      color: range === v ? '#fff' : '#6b7280',
                    }}
                  >{l}</button>
                ))}
              </div>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{filtered.length} recipe{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          {recipes.length === 0 && (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', padding: '48px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>No recipes yet</p>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 16px' }}>Add a recipe, then use “Fill from screenshot” inside it to import from your Google Sheet.</p>
              <Button size="sm" onClick={() => setEditorState({})}>+ New recipe</Button>
            </div>
          )}

          {/* Recipe grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '12px' }}>
            {filtered.map(r => {
              const linkedProduct = products.find(p => p.id === r.productId)
              const cost = computeRecipeCost(r, ingredients)
              return (
                <Link key={r.id} href={`/recipes/${r.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s', height: '100%', boxSizing: 'border-box' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#f3f4f6')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{r.name}</p>
                        {r.variation && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{r.variation}</p>}
                      </div>
                      {cost.complete ? (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                          £{cost.costPerLitre.toFixed(2)}/L
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                          ? price missing
                        </span>
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
                      <p style={{ fontSize: '11px', color: '#d1d5db', margin: 0 }}>No product linked — cost won't flow to finances</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
