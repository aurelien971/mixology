'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import RecipeEditor, { RecipeDraft } from '@/components/recipes/RecipeEditor'
import ProcessEditor, { ProcessDraft } from '@/components/recipes/ProcessEditor'
import { getRecipeDrafts, deleteRecipeDraft } from '@/lib/firestore/recipeDrafts'
import { getRecipes } from '@/lib/firestore/recipes'
import { getProducts } from '@/lib/firestore/catalog'
import { getIngredients } from '@/lib/firestore/ingredients'
import { RecipeDraftDoc, Recipe, Product, Ingredient } from '@/types'
import { findIngredientMatch } from '@/lib/costing'
import toast from 'react-hot-toast'

type Filter = 'all' | 'recipe' | 'process'

function ConfidenceBadge({ score }: { score: number }) {
  const c = score >= 75
    ? { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', label: 'High' }
    : score >= 45
    ? { bg: '#fefce8', text: '#854d0e', border: '#fde68a', label: 'Medium' }
    : { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', label: 'Low' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {c.label} · {score}%
    </span>
  )
}

export default function RecipeReviewPage() {
  const [drafts, setDrafts] = useState<RecipeDraftDoc[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [reviewing, setReviewing] = useState<RecipeDraftDoc | null>(null)

  function load() {
    Promise.all([getRecipeDrafts(), getRecipes(), getProducts(), getIngredients()])
      .then(([d, r, p, i]) => { setDrafts(d); setRecipes(r); setProducts(p); setIngredients(i) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const activeProducts = useMemo(() => products.filter(p => p.isActive !== false), [products])

  const filtered = drafts.filter(d => filter === 'all' || d.kind === filter)

  // Products with no recipe on the platform AND no pending draft matched to them
  const noDocument = useMemo(() => {
    const draftProductIds = new Set(drafts.filter(d => d.matchedProductId).map(d => d.matchedProductId))
    return activeProducts.filter(p =>
      !recipes.some(r => r.productId === p.id) && !draftProductIds.has(p.id)
    )
  }, [activeProducts, recipes, drafts])

  async function reject(draft: RecipeDraftDoc) {
    if (!confirm(`Reject “${draft.name}”? The draft is discarded (the spreadsheet is untouched).`)) return
    await deleteRecipeDraft(draft.id)
    toast.success('Draft rejected')
    load()
  }

  async function approved(draft: RecipeDraftDoc) {
    await deleteRecipeDraft(draft.id)
    load()
  }

  const recipeEditorDraft = (d: RecipeDraftDoc): RecipeDraft => ({
    name: d.name,
    variation: d.client,
    version: d.version,
    productId: d.matchedProductId,
    ingredients: d.ingredients.map(i => ({
      name: i.name,
      unit: 'KG',
      qtyPer1L: i.qtyPer1L,
      qtyPer1000L: Math.round(i.qtyPer1L * 1000 * 10000) / 10000,
    })),
    analyticalValues: d.analyticalValues,
    cookingInstructions: d.cookingInstructions,
    approxTimeMinutes: d.approxTimeMinutes,
  })

  const processEditorDraft = (d: RecipeDraftDoc): ProcessDraft => ({
    name: d.name,
    description: d.cookingInstructions,
    laborMinutes: d.laborMinutes,
    yieldAmount: 1,
    yieldUnit: 'kg',
    subs: d.ingredients.map(i => ({ name: i.name, amount: i.qtyPer1L, unit: 'kg' })),
  })

  const pendingRecipes = drafts.filter(d => d.kind === 'recipe').length
  const pendingProcesses = drafts.filter(d => d.kind === 'process').length

  return (
    <div>
      {reviewing && reviewing.kind === 'recipe' && (
        <RecipeEditor
          draft={recipeEditorDraft(reviewing)}
          products={activeProducts}
          onSaved={() => approved(reviewing)}
          onClose={() => setReviewing(null)}
        />
      )}
      {reviewing && reviewing.kind === 'process' && (
        <ProcessEditor
          draft={processEditorDraft(reviewing)}
          ingredients={ingredients}
          onSaved={() => approved(reviewing)}
          onClose={() => setReviewing(null)}
        />
      )}

      <Header
        title="Review imported recipes"
        subtitle="Extracted from the Cocktail Production blend sheets — nothing goes live until you approve it"
        action={<Link href="/recipes"><Button variant="secondary" size="sm">← Back to recipes</Button></Link>}
      />

      {loading ? (
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      ) : (
        <>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
            {([
              { key: 'all', label: `All (${drafts.length})` },
              { key: 'recipe', label: `🍸 Drink recipes (${pendingRecipes})` },
              { key: 'process', label: `⚙️ House blends (${pendingProcesses})` },
            ] as { key: Filter; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{
                padding: '7px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
                background: filter === t.key ? '#fff' : 'transparent',
                color: filter === t.key ? '#111827' : '#6b7280',
                boxShadow: filter === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>{t.label}</button>
            ))}
          </div>

          {drafts.length === 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '32px', textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#166534', margin: 0 }}>✓ All imported drafts reviewed</p>
            </div>
          )}

          {/* Tip for house blends */}
          {filter !== 'recipe' && pendingProcesses > 0 && (
            <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#1d4ed8', margin: 0 }}>
                💡 Approve the ⚙️ house blends first — drink recipes use them as ingredients, so they'll match automatically afterwards.
              </p>
            </div>
          )}

          {/* Draft cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {filtered.map(d => {
              // Live match against the CURRENT library — an approved house blend
              // immediately turns green in the remaining drafts
              const pool = d.kind === 'process' ? ingredients.filter(i => !i.isProcess) : ingredients
              const unmatched = d.ingredients.filter(i => !findIngredientMatch(i.name, pool))
              return (
                <div key={d.id} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                        {d.kind === 'process' ? '⚙️ ' : ''}{d.name}
                      </span>
                      {d.client && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#7e22ce', background: '#f3e8ff', padding: '1px 8px', borderRadius: '20px' }}>{d.client}</span>
                      )}
                      <ConfidenceBadge score={d.confidence} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {d.kind === 'recipe' && (
                        d.matchedProductId ? (
                          <span style={{ color: '#1d4ed8' }}>
                            → {d.matchedProductCode} {d.matchedProductName}
                            {d.productHasRecipe && <strong style={{ color: '#dc2626' }}> (already has a recipe!)</strong>}
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626' }}>no product match — pick one during review</span>
                        )
                      )}
                      <span>{d.ingredients.length} ingredients{unmatched.length > 0 ? ` · ${unmatched.length} not in library` : ' · all matched ✓'}</span>
                      {!d.cookingInstructions && <span style={{ color: '#b45309' }}>no method steps</span>}
                    </div>
                    {unmatched.length > 0 && (
                      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
                        Missing: {unmatched.slice(0, 6).map(i => i.name).join(', ')}{unmatched.length > 6 ? ` +${unmatched.length - 6} more` : ''}
                      </p>
                    )}
                    <p style={{ fontSize: '10px', color: '#d1d5db', margin: '3px 0 0', fontFamily: 'monospace' }}>{d.sourceFile}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button size="sm" onClick={() => setReviewing(d)}>Review & approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => reject(d)} style={{ color: '#dc2626' } as React.CSSProperties}>Reject</Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* No document found */}
          {noDocument.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '14px', padding: '16px 20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                📄 No document found — {noDocument.length} drink{noDocument.length !== 1 ? 's' : ''}
              </p>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 12px' }}>
                These products have no recipe on the platform and no blend sheet in the folder — they'll need manual entry or a screenshot.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {noDocument.map(p => (
                  <span key={p.id} style={{ padding: '5px 12px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', fontSize: '12px', color: '#6b7280' }}>
                    {p.name} <span style={{ color: '#d1d5db', fontFamily: 'monospace', fontSize: '10px' }}>{p.productCode}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
