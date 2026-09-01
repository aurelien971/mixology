'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts } from '@/lib/firestore/catalog'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients, updateIngredient } from '@/lib/firestore/ingredients'
import { matchIngredient } from '@/lib/costing'
import { looksAlcoholic, isAlcoholicIngredient } from '@/lib/pricing'
import { Product, Recipe, Ingredient } from '@/types'
import toast from 'react-hot-toast'

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '18px 20px',
}

function money(n: number) { return '£' + n.toFixed(2) }

interface Line {
  ingredient: Ingredient
  costPerLitre: number
  alcoholic: boolean
  guessed: boolean          // no one has confirmed it — this is the name heuristic
}

export default function AlcoholPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function load() {
    Promise.all([getProducts(), getRecipes(), getIngredients()])
      .then(([p, r, i]) => { setProducts(p); setRecipes(r); setIngredients(i) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const picked = useMemo(
    () => products.filter((p) => p.isActive !== false && p.isClassic),
    [products]
  )

  // Every ingredient used by the selected range, with what it contributes and
  // whether anyone has actually confirmed it is the spirit.
  const drinks = useMemo(() => {
    return picked.map((p) => {
      const rs = recipes.filter((r) => r.productId === p.id)
      const seen = new Map<string, Line>()
      for (const r of rs) {
        for (const row of r.ingredients) {
          const ing = matchIngredient(row, ingredients)
          if (!ing) continue
          const cost = row.qtyPer1L * (ing.pricePerUnit || 0)
          const prev = seen.get(ing.id)
          if (prev) { prev.costPerLitre = Math.max(prev.costPerLitre, cost); continue }
          seen.set(ing.id, {
            ingredient: ing,
            costPerLitre: cost,
            alcoholic: isAlcoholicIngredient(ing, row.name),
            guessed: ing.isAlcoholic === undefined,
          })
        }
      }
      const lines = [...seen.values()].sort((a, b) => b.costPerLitre - a.costPerLitre)
      const spirit = lines.filter((l) => l.alcoholic).reduce((s, l) => s + l.costPerLitre, 0)
      const total = lines.reduce((s, l) => s + l.costPerLitre, 0)
      return { product: p, recipes: rs, lines, spirit, total }
    })
  }, [picked, recipes, ingredients])

  const unconfirmed = useMemo(() => {
    const ids = new Set<string>()
    drinks.forEach((d) => d.lines.forEach((l) => { if (l.guessed) ids.add(l.ingredient.id) }))
    return ids.size
  }, [drinks])

  async function set(ing: Ingredient, alcoholic: boolean) {
    setBusy(true)
    setIngredients((prev) => prev.map((x) => (x.id === ing.id ? { ...x, isAlcoholic: alcoholic } : x)))
    try { await updateIngredient(ing.id, { isAlcoholic: alcoholic }) } finally { setBusy(false) }
  }

  // Accept every guess at once — most of them are right, and the ones that are
  // not are obvious from the cost column.
  async function acceptAll() {
    const todo = new Map<string, boolean>()
    drinks.forEach((d) => d.lines.forEach((l) => { if (l.guessed) todo.set(l.ingredient.id, l.alcoholic) }))
    if (!todo.size) return
    setBusy(true)
    try {
      for (const [id, alcoholic] of todo) await updateIngredient(id, { isAlcoholic: alcoholic })
      setIngredients(await getIngredients())
      toast.success(`${todo.size} confirmed`)
    } finally { setBusy(false) }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  return (
    <div>
      <Header
        title="What counts as the spirit"
        subtitle="The syrup price depends entirely on this split, so it is worth being right."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/range"><Button size="sm" variant="ghost">← Range</Button></Link>
            <Button size="sm" variant="secondary" onClick={acceptAll} loading={busy} disabled={busy || !unconfirmed}>
              Accept {unconfirmed} guess{unconfirmed === 1 ? '' : 'es'}
            </Button>
            <Link href="/pricing"><Button size="sm">Back to pricing →</Button></Link>
          </div>
        }
      />

      {picked.length === 0 ? (
        <div style={card}>
          <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#374151' }}>
            Nothing selected yet. Pick the drinks you are building the range on first.
          </p>
          <Link href="/range"><Button size="sm">Choose the core classics →</Button></Link>
        </div>
      ) : (
        <>
          <div style={{ ...card, marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.6, color: '#4b5563', maxWidth: '84ch' }}>
              On the syrup format the venue buys the spirit and we supply the rest, so
              <strong style={{ color: '#111827' }}> every line ticked here leaves our cost and our invoice</strong> —
              and lands on the venue&apos;s GP instead. A line marked in error moves the price in both directions at once.
              Amber rows are a guess from the ingredient name; ticked or unticked, they are worth ten seconds each.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {drinks.map((d) => (
              <div key={d.product.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 700, color: '#111827' }}>{d.product.name}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                      {d.product.productCode} · {d.recipes.length} recipe{d.recipes.length === 1 ? '' : 's'} · {d.lines.length} ingredients
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '18px', fontSize: '12px' }}>
                    <span style={{ color: '#9ca3af' }}>
                      Spirit <strong style={{ color: '#111827', fontFamily: 'monospace' }}>{money(d.spirit)}</strong>/L
                    </span>
                    <span style={{ color: '#9ca3af' }}>
                      We&apos;d supply <strong style={{ color: '#166534', fontFamily: 'monospace' }}>{money(d.total - d.spirit)}</strong>/L
                    </span>
                    <span style={{ color: '#9ca3af' }}>
                      {d.total > 0 ? Math.round((d.spirit / d.total) * 100) : 0}% is spirit
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {d.lines.map((l) => (
                    <label
                      key={l.ingredient.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '22px 1fr 110px 90px', gap: '10px',
                        alignItems: 'center', padding: '7px 8px', borderBottom: '1px solid #fafafa',
                        cursor: 'pointer', borderRadius: '6px',
                        background: l.guessed ? '#fffbeb' : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={l.alcoholic}
                        disabled={busy}
                        onChange={(e) => set(l.ingredient, e.target.checked)}
                        style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '13.5px', color: l.alcoholic ? '#111827' : '#6b7280', fontWeight: l.alcoholic ? 600 : 400 }}>
                        {l.ingredient.name}
                        {l.guessed && (
                          <span style={{ marginLeft: '7px', fontSize: '10px', fontWeight: 700, color: '#92400e', letterSpacing: '0.04em' }}>
                            GUESSED
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '12.5px', color: '#9ca3af', textAlign: 'right', fontFamily: 'monospace' }}>
                        {money(l.costPerLitre)}/L
                      </span>
                      <span style={{ fontSize: '11.5px', textAlign: 'right', color: l.alcoholic ? '#b45309' : '#16a34a', fontWeight: 600 }}>
                        {l.alcoholic ? 'They buy' : 'We supply'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
