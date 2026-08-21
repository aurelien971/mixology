'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getRecipe, updateRecipe, deleteRecipe } from '@/lib/firestore/recipes'
import { getProducts } from '@/lib/firestore/catalog'
import { getIngredients } from '@/lib/firestore/ingredients'
import { computeRecipeCost } from '@/lib/costing'
import RecipeEditor from '@/components/recipes/RecipeEditor'
import { Recipe, Product, Ingredient } from '@/types'
import toast from 'react-hot-toast'

export default function RecipeDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [recipe, setRecipe]     = useState<Recipe | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(true)
  const [litres, setLitres]     = useState(100)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [showEdit, setShowEdit] = useState(false)
  const [linking, setLinking]   = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')

  async function load() {
    const [r, p, ings] = await Promise.all([getRecipe(id), getProducts(), getIngredients()])
    setRecipe(r)
    setProducts(p)
    setIngredients(ings)
    if (r?.productId) setSelectedProduct(r.productId)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function saveProductLink() {
    if (!recipe) return
    setLinking(true)
    try {
      const product = products.find(p => p.id === selectedProduct)
      await updateRecipe(id, {
        productId:   selectedProduct || undefined,
        productCode: product?.productCode,
        productName: product?.name,
      })
      toast.success('Product linked')
      load()
    } catch { toast.error('Failed to save') }
    finally { setLinking(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${recipe?.name}"? This cannot be undone.`)) return
    await deleteRecipe(id)
    toast.success('Recipe deleted')
    router.push('/recipes')
  }

  async function exportPDF() {
    if (!recipe) return
    try {
      const [{ pdf }, PDFModule, { default: React }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/pdf/recipe'),
        import('react'),
      ])
      const RecipePDF = PDFModule.RecipePDF ?? PDFModule.default
      const blob = await pdf(React.createElement(RecipePDF, { recipe, litres }) as any).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `${recipe.name.replace(/\s+/g, '-')}-recipe.pdf`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e); toast.error('Failed to generate PDF')
    }
  }

  if (loading) return <div style={{ padding: '40px', color: '#9ca3af', fontSize: '13px' }}>Loading...</div>
  if (!recipe) return <div style={{ padding: '40px', color: '#9ca3af', fontSize: '13px' }}>Recipe not found</div>

  const linkedProduct = products.find(p => p.id === recipe.productId)
  const scale = litres / 1000  // everything is per 1000L in Excel
  const cost = computeRecipeCost(recipe, ingredients)

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: '900px' }}>
      {showEdit && (
        <RecipeEditor
          existing={recipe}
          products={products}
          onSaved={() => load()}
          onClose={() => setShowEdit(false)}
        />
      )}
      <Header
        title={recipe.name}
        subtitle={[recipe.variation, recipe.version ? `v${recipe.version}` : null, recipe.createdBy].filter(Boolean).join(' · ')}
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => router.back()}>← Back</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>Edit recipe</Button>
            <Button variant="secondary" size="sm" onClick={exportPDF}>↓ Export PDF</Button>
            <Button variant="secondary" size="sm" onClick={handleDelete} style={{ color: '#dc2626' } as React.CSSProperties}>Delete</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', alignItems: 'start' }}>

        {/* LEFT — main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Ingredient table */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Ingredients</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>Scale to</span>
                <input
                  type="number" min="1" step="1" value={litres}
                  onChange={e => setLitres(Math.max(1, parseInt(e.target.value) || 100))}
                  style={{ width: '70px', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', outline: 'none', textAlign: 'right' }}
                />
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>L</span>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 18px', color: '#9ca3af', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingredient</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: '#9ca3af', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Per 1000L</th>
                  <th style={{ textAlign: 'right', padding: '8px 18px', color: '#9ca3af', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>For {litres}L</th>
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ing, i) => {
                  const qty = Math.round(ing.qtyPer1000L * scale * 1000) / 1000
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 18px', color: '#111827', fontWeight: 500 }}>
                        {ing.name}
                        {ing.supplier && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af' }}>{ing.supplier}</span>}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6b7280', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{ing.qtyPer1000L}</td>
                      <td style={{ padding: '10px 18px', color: '#111827', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{qty} {ing.unit === 'L' ? 'L' : ing.unit === 'UNIT' ? 'units' : 'kg'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Analytical values */}
          {recipe.analyticalValues.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px 18px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>Analytical values</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {recipe.analyticalValues.map((av, i) => (
                  <div key={i} style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 14px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{av.name}</p>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                      {av.min != null && <span style={{ color: '#6b7280' }}>Min: <strong style={{ color: '#111827' }}>{av.min}</strong></span>}
                      {av.target != null && <span style={{ color: '#6b7280' }}>Target: <strong style={{ color: '#111827' }}>{av.target}</strong></span>}
                      {av.max != null && <span style={{ color: '#6b7280' }}>Max: <strong style={{ color: '#111827' }}>{av.max}</strong></span>}
                    </div>
                    {av.notes && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>{av.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cooking instructions */}
          {recipe.cookingInstructions && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px 18px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>Cooking instructions</h3>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {recipe.cookingInstructions}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Cost */}
          <div style={{ background: cost.complete ? '#f0fdf4' : '#fffbeb', borderRadius: '12px', border: `1px solid ${cost.complete ? '#bbf7d0' : '#fde68a'}`, padding: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: cost.complete ? '#166534' : '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Cost to make</p>
            {cost.complete ? (
              <>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#166534', margin: '0 0 2px' }}>£{cost.costPerLitre.toFixed(2)}<span style={{ fontSize: '13px', fontWeight: 500 }}> / litre</span></p>
                <p style={{ fontSize: '12px', color: '#4b7c5e', margin: 0 }}>£{(cost.costPerLitre * litres).toFixed(2)} for this {litres}L batch</p>
              </>
            ) : (
              <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
                Needs prices for: {cost.missingIngredients.join(', ') || 'some ingredients'}. Add them in Stock take → Ingredients.
              </p>
            )}
          </div>

          {/* Product link */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Linked product</p>
            {linkedProduct ? (
              <div style={{ marginBottom: '10px', padding: '8px 10px', background: '#eff6ff', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace', margin: '0 0 2px' }}>{linkedProduct.productCode}</p>
                <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{linkedProduct.name}</p>
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>No product linked</p>
            )}
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              style={{ ...inp, marginBottom: '8px' }}
            >
              <option value="">— unlink —</option>
              {products.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <option key={p.id} value={p.id}>{p.productCode} · {p.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={saveProductLink} loading={linking} style={{ width: '100%' } as React.CSSProperties}>
              Save link
            </Button>
          </div>

          {/* Meta */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12px' }}>
              {recipe.createdBy  && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Created by</span><span style={{ color: '#374151', fontWeight: 500 }}>{recipe.createdBy}</span></div>}
              {recipe.version    && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Version</span><span style={{ color: '#374151' }}>v{recipe.version}</span></div>}
              {recipe.dateCreated && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Date</span><span style={{ color: '#374151' }}>{recipe.dateCreated}</span></div>}
              {recipe.approxTimeMinutes != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Approx. cook time</span><span style={{ color: '#374151', fontWeight: 500 }}>{recipe.approxTimeMinutes >= 60 ? `${Math.floor(recipe.approxTimeMinutes / 60)}h${recipe.approxTimeMinutes % 60 ? ` ${recipe.approxTimeMinutes % 60}m` : ''}` : `${recipe.approxTimeMinutes} min`}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Ingredients</span><span style={{ color: '#374151' }}>{recipe.ingredients.length}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>Status</span>
                <select
                  value={recipe.status}
                  onChange={async e => { await updateRecipe(id, { status: e.target.value as any }); load() }}
                  style={{ fontSize: '12px', border: 'none', outline: 'none', color: recipe.status === 'active' ? '#16a34a' : '#9ca3af', background: 'transparent', cursor: 'pointer' }}
                >
                  <option value="active">Active</option>
                  <option value="discontinued">Discontinued</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}