'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts, updateProduct } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { computeRecipeCost } from '@/lib/costing'
import { Product, Recipe, Ingredient } from '@/types'

const CATEGORIES = [
  'Highball', 'Martini', 'Sour', 'Negroni', 'Margarita', 'Spritz',
  'G&T', 'Old Fashioned', 'Milk Punch', 'Tropical', 'Savoury',
  'Coffee', 'Non-Alcoholic', 'Other',
]

// Every serving size the range actually uses, so the common answer is one click.
const COMMON_SERVES = [
  { ml: 100, label: '100ml', hint: 'short, stirred' },
  { ml: 110, label: '110ml', hint: 'mezcal serves' },
  { ml: 120, label: '120ml', hint: 'martini, negroni' },
  { ml: 136, label: '136ml', hint: 'old fashioned' },
  { ml: 160, label: '160ml', hint: 'sour' },
  { ml: 188, label: '188ml', hint: 'margarita' },
  { ml: 218, label: '218ml', hint: 'espresso martini' },
  { ml: 380, label: '380ml', hint: 'long, with tonic' },
]

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #f3f4f6', borderRadius: '14px', padding: '26px 28px',
}
const label: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
  letterSpacing: '0.05em', display: 'block', marginBottom: '7px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', fontSize: '14px', color: '#111827',
  border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', boxSizing: 'border-box',
  background: '#fff', fontFamily: 'inherit',
}

type GapKind = 'serving' | 'category' | 'price' | 'recipe' | 'ingredients'

const GAP_LABEL: Record<GapKind, string> = {
  serving:     'Serving size',
  category:    'Category',
  price:       'Sell price',
  recipe:      'No recipe',
  ingredients: 'Unpriced ingredients',
}

interface Gap {
  product: Product
  recipe?: Recipe
  missing: GapKind[]
  unpriced: string[]
}

export default function FillPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  const [i, setI] = useState(0)
  const [saving, setSaving] = useState(false)
  const [filled, setFilled] = useState<Set<string>>(new Set())

  // Draft for the card on screen
  const [serving, setServing] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    Promise.all([getProducts(), getRecipes(), getIngredients()])
      .then(([p, r, ing]) => { setProducts(p); setRecipes(r); setIngredients(ing) })
      .finally(() => setLoading(false))
  }, [])

  const gaps = useMemo<Gap[]>(() => {
    return products
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const recipe = recipes.find((r) => r.productId === p.id)
        const missing: GapKind[] = []
        // 100 is the seeded default rather than a measured serve, so it counts
        // as unanswered until someone confirms it.
        if (!p.recommendedServingG || p.recommendedServingG === 100) missing.push('serving')
        if (!p.category) missing.push('category')
        if (p.isCoreRange && !p.defaultPricePerLitre) missing.push('price')
        if (!recipe) missing.push('recipe')

        let unpriced: string[] = []
        if (recipe) {
          const cost = computeRecipeCost(recipe, ingredients)
          if (!cost.complete) { unpriced = cost.missingIngredients; missing.push('ingredients') }
        }
        return { product: p, recipe, missing, unpriced }
      })
      .filter((g) => g.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length)
  }, [products, recipes, ingredients])

  const remaining = gaps.filter((g) => !filled.has(g.product.id))
  const current = remaining[Math.min(i, Math.max(0, remaining.length - 1))]

  // Load the card's drafts whenever the card changes, without an effect.
  const [seenId, setSeenId] = useState<string | null>(null)
  if (current && seenId !== current.product.id) {
    setSeenId(current.product.id)
    setServing(current.product.recommendedServingG ? String(current.product.recommendedServingG) : '')
    setCategory(current.product.category ?? '')
    setPrice(current.product.defaultPricePerLitre ? String(current.product.defaultPricePerLitre) : '')
  }

  async function saveAndNext() {
    if (!current) return
    setSaving(true)
    try {
      const patch: Partial<Product> = {}
      const s = Number(serving)
      if (s > 0 && s !== current.product.recommendedServingG) patch.recommendedServingG = s
      if (category && category !== current.product.category) patch.category = category
      const pr = Number(price)
      if (pr > 0 && pr !== current.product.defaultPricePerLitre) patch.defaultPricePerLitre = pr

      if (Object.keys(patch).length) {
        await updateProduct(current.product.id, patch)
        setProducts((prev) => prev.map((p) => (p.id === current.product.id ? { ...p, ...patch } : p)))
      }
      setFilled((prev) => new Set(prev).add(current.product.id))
      setI(0)
    } finally { setSaving(false) }
  }

  function skip() {
    if (!current) return
    setI((n) => (n + 1 >= remaining.length ? 0 : n + 1))
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  const total = gaps.length
  const done = total - remaining.length
  const pct = total ? Math.round((done / total) * 100) : 100

  return (
    <div style={{ maxWidth: '760px' }}>
      <Header
        title="Fill the gaps"
        subtitle="Every drink missing something the costing needs. One at a time."
        action={<Link href="/recipes"><Button size="sm" variant="secondary">← Recipes</Button></Link>}
      />

      {total === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, fontSize: '15px', color: '#166534', fontWeight: 600 }}>Nothing missing.</p>
          <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#6b7280' }}>
            Every active drink has a serving size, a category, a recipe and priced ingredients.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>
                {remaining.length} to go{done > 0 ? ` · ${done} done this session` : ''}
              </span>
              <span style={{ fontSize: '12px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
            </div>
            <div style={{ height: '5px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16a34a' : '#111827', transition: 'width .2s' }} />
            </div>
          </div>

          {!current ? (
            <div style={card}>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#166534' }}>All done for now.</p>
              <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#6b7280' }}>
                Anything you skipped is still on the list — reload to go round again.
              </p>
            </div>
          ) : (
            <div style={card}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {current.missing.map((m) => (
                  <span key={m} style={{
                    fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '3px 9px', borderRadius: '20px',
                    background: m === 'recipe' ? '#fee2e2' : '#fef3c7',
                    color: m === 'recipe' ? '#991b1b' : '#92400e',
                  }}>{GAP_LABEL[m]}</span>
                ))}
              </div>

              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>{current.product.name}</h2>
              <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: '0 0 22px', fontFamily: 'monospace' }}>{current.product.productCode}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {current.missing.includes('serving') && (
                  <div>
                    <span style={label}>How much liquid is one serve?</span>
                    <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: '-3px 0 9px', lineHeight: 1.5 }}>
                      The finished drink out of the bottle, in ml. Everything — cost per serve, venue GP, the rate card —
                      is calculated from this, and right now it is the one number nobody has confirmed.
                    </p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {COMMON_SERVES.map((c) => (
                        <button
                          key={c.ml}
                          onClick={() => setServing(String(c.ml))}
                          style={{
                            border: '1px solid', borderColor: serving === String(c.ml) ? '#111827' : '#e5e7eb',
                            background: serving === String(c.ml) ? '#111827' : '#fff',
                            color: serving === String(c.ml) ? '#fff' : '#4b5563',
                            borderRadius: '8px', padding: '6px 11px', cursor: 'pointer', fontSize: '12.5px',
                          }}
                          title={c.hint}
                        >{c.label}</button>
                      ))}
                    </div>
                    <input
                      value={serving}
                      onChange={(e) => setServing(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="or type it"
                      inputMode="decimal"
                      style={{ ...input, fontFamily: 'monospace' }}
                    />
                  </div>
                )}

                {current.missing.includes('category') && (
                  <div>
                    <span style={label}>Category</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                      <option value="">Pick one…</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {current.missing.includes('price') && (
                  <div>
                    <span style={label}>Our sell price, per litre</span>
                    <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: '-3px 0 9px' }}>
                      It is in the core range, so it needs a standard price before it can appear on a rate card.
                    </p>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="£ per litre"
                      inputMode="decimal"
                      style={{ ...input, fontFamily: 'monospace' }}
                    />
                  </div>
                )}

                {current.missing.includes('recipe') && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 700, color: '#991b1b' }}>No recipe attached</p>
                    <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>
                      Without one it can never be costed, so it will sit out of every GP figure and off the rate card.
                    </p>
                    <Link href="/recipes"><Button size="sm" variant="secondary">Add a recipe</Button></Link>
                  </div>
                )}

                {current.missing.includes('ingredients') && current.unpriced.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 700, color: '#92400e' }}>
                      {current.unpriced.length} ingredient{current.unpriced.length === 1 ? '' : 's'} with no price
                    </p>
                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#a16207', lineHeight: 1.55 }}>
                      {current.unpriced.join(' · ')}
                    </p>
                    <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#a16207' }}>
                      Try the LWC import first — it prices most spirits automatically. Anything left is bought elsewhere
                      and needs a price on the stock take.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link href="/lwc"><Button size="sm" variant="secondary">LWC pricing</Button></Link>
                      <Link href="/stocktake"><Button size="sm" variant="secondary">Stock take</Button></Link>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '26px', paddingTop: '18px', borderTop: '1px solid #f3f4f6' }}>
                <Button onClick={saveAndNext} loading={saving} disabled={saving}>Save and next →</Button>
                <Button variant="ghost" onClick={skip} disabled={saving}>Skip for now</Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
              Still to do
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {remaining.slice(0, 40).map((g, n) => (
                <button
                  key={g.product.id}
                  onClick={() => setI(n)}
                  style={{
                    border: '1px solid', borderColor: g.product.id === current?.product.id ? '#111827' : '#e5e7eb',
                    background: '#fff', borderRadius: '20px', padding: '4px 10px',
                    fontSize: '11.5px', color: '#6b7280', cursor: 'pointer',
                  }}
                >
                  {g.product.name}
                  <span style={{ color: '#d1d5db', marginLeft: '5px' }}>{g.missing.length}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
