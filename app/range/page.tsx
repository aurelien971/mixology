'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import RecipeEditor from '@/components/recipes/RecipeEditor'
import { GpBadge } from '@/components/accounts/PriceForm'
import { NumInput } from '@/components/onboarding/shared'
import { getProducts, updateProduct, createProduct } from '@/lib/firestore/catalog'
import { getRecipes, updateRecipe } from '@/lib/firestore/recipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { useTable, ColumnDef } from '@/hooks/useTable'
import { liveCost, primaryRecipe } from '@/lib/liveCost'
import { nextCode } from '@/lib/coreRange'
import {
  CORE_RANGE, CoreClassicSpec, Ingredient, Product, Recipe, classicKeys, normalizeDrinkName, matchesClassic,
} from '@/types'
import toast from 'react-hot-toast'

/**
 * The core range, and nothing else: the twenty drinks, each with its recipe,
 * serve, our price per litre, the RSP a venue sells it at, what it costs us,
 * and who keeps what. Prices set here are every drink's default — each
 * account's price list starts from them.
 */

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'
const VENUE_TARGET = 80

interface Row {
  spec: CoreClassicSpec
  order: number
  product?: Product
  recipe?: Recipe
  recipeCount: number
  serve: number | null
  ppl?: number
  rsp?: number
  perServe: number | null
  costPerLitre: number | null
  costPerServe: number | null
  ourGp: number | null
  theirGp: number | null
  pplFor80: number | null
  costNote?: string
  dupProducts: Product[]
  strayRecipes: Recipe[]
}

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'drink',   label: 'Drink',         width: 190, sortValue: (r) => r.order },
  { key: 'recipe',  label: 'Recipe',        width: 190, sortValue: (r) => (r.recipe ? r.recipe.name : null) },
  { key: 'serve',   label: 'Serve ml',      width: 88,  align: 'right', sortValue: (r) => r.serve, descFirst: true },
  { key: 'ppl',     label: 'Price / L',     width: 120, align: 'right', sortValue: (r) => r.ppl, descFirst: true },
  { key: 'rsp',     label: 'RSP',           width: 100, align: 'right', sortValue: (r) => r.rsp, descFirst: true },
  { key: 'serveP',  label: 'Price / serve', width: 100, align: 'right', sortValue: (r) => r.perServe, descFirst: true },
  { key: 'costL',   label: 'Cost / L',      width: 90,  align: 'right', sortValue: (r) => r.costPerLitre, descFirst: true },
  { key: 'costS',   label: 'Cost / serve',  width: 96,  align: 'right', sortValue: (r) => r.costPerServe, descFirst: true },
  { key: 'ourGp',   label: 'Our GP',        width: 88,  align: 'right', sortValue: (r) => r.ourGp, descFirst: true },
  { key: 'theirGp', label: 'Their GP',      width: 88,  align: 'right', sortValue: (r) => r.theirGp, descFirst: true },
  { key: 'dups',    label: 'Filed elsewhere', width: 130, sortValue: (r) => r.dupProducts.length + r.strayRecipes.length, descFirst: true },
]

const money = (n: number) => `£${n.toFixed(2)}`
const r2 = (n: number) => Math.round(n * 100) / 100

export default function CoreRangePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [writingFor, setWritingFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cols = useTable<Row>('core-range', COLUMNS)

  async function load() {
    const [p, r, i] = await Promise.all([getProducts(), getRecipes(), getIngredients()])
    setProducts(p); setRecipes(r); setIngredients(i)
    setLoading(false)
  }

  useEffect(() => {
    ;(async () => { await load() })()
  }, [])

  const rows: Row[] = CORE_RANGE.map((spec, order) => {
    const keys = classicKeys(spec)
    const live = products.filter((p) => p.isActive !== false)
    // The drink's product: the one flagged as the classic, else an exact name.
    const product = live.find((p) => p.isClassic && (matchesClassic(p.name) ?? p.name) === spec.name)
      ?? live.find((p) => keys.includes(normalizeDrinkName(p.name)))
    const recipe = product ? primaryRecipe(product, recipes) : undefined
    const cost = product ? liveCost(product, recipes, ingredients) : null
    const serve = product?.recommendedServingG || null
    const ppl = product?.defaultPricePerLitre
    const rsp = product?.defaultRsp
    const perServe = ppl && serve ? (ppl * serve) / 1000 : null
    const costPerLitre = cost?.perLitre ?? null
    const costPerServe = costPerLitre !== null && serve ? (costPerLitre * serve) / 1000 : null
    const net = rsp ? rsp / 1.2 : 0
    return {
      spec, order, product, recipe,
      recipeCount: product ? recipes.filter((r) => r.productId === product.id).length : 0,
      serve, ppl, rsp, perServe, costPerLitre, costPerServe,
      ourGp: ppl && costPerLitre !== null ? ((ppl - costPerLitre) / ppl) * 100 : null,
      theirGp: net > 0 && perServe !== null ? ((net - perServe) / net) * 100 : null,
      pplFor80: net > 0 && serve ? r2((net * (1 - VENUE_TARGET / 100) * 1000) / serve) : null,
      costNote: !product ? 'no product' : cost && cost.perLitre === null ? (cost.fromRecipe ? `unpriced: ${cost.missing.slice(0, 2).join(', ')}` : 'no recipe') : undefined,
      dupProducts: products.filter((p) => p.id !== product?.id && keys.includes(normalizeDrinkName(p.name))),
      strayRecipes: recipes.filter((r) => r.productId !== product?.id && keys.includes(normalizeDrinkName(r.name))),
    }
  })

  const withRecipe = rows.filter((r) => r.recipe).length
  const priced = rows.filter((r) => r.ppl && r.rsp).length
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const avgOur = avg(rows.map((r) => r.ourGp))
  const avgTheir = avg(rows.map((r) => r.theirGp))
  const tidy = rows.filter((r) => r.dupProducts.length || r.strayRecipes.length).length

  async function setField(r: Row, data: Partial<Product>, what: string) {
    if (!r.product) return
    setProducts((prev) => prev.map((p) => (p.id === r.product!.id ? { ...p, ...data } : p)))
    try { await updateProduct(r.product.id, data) } catch { toast.error(`Could not save the ${what}`); await load() }
  }

  async function makeProduct(r: Row) {
    setBusy(true)
    try {
      const all = await getProducts()
      const code = `FL-${nextCode(all)}`
      await createProduct({
        productCode: code, baseCode: code, name: r.spec.name, category: r.spec.category,
        recommendedServingG: 100, volumeLitres: 5, costToMake: 0, costMissing: true,
        isNonAlcoholic: !!r.spec.nonAlcoholic, isCoreRange: true, isClassic: true, isActive: true,
      })
      toast.success(`${r.spec.name} created as ${code}`)
      await load()
    } finally { setBusy(false) }
  }

  async function moveRecipe(r: Row, recipe: Recipe) {
    if (!r.product) return
    const from = products.find((p) => p.id === recipe.productId)
    if (!confirm(`Link the recipe "${recipe.name}"${recipe.variation ? ` (${recipe.variation})` : ''} to ${r.spec.name} (${r.product.productCode})?${from ? `\n\nIt is linked to ${from.name} (${from.productCode}) now — that product will lose it.` : ''}`)) return
    await updateRecipe(recipe.id, { productId: r.product.id, productCode: r.product.productCode, productName: r.product.name })
    toast.success(`${recipe.name} now belongs to ${r.spec.name}`)
    await load()
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
      Drink: r.spec.name,
      'Product code': r.product?.productCode ?? '',
      Recipe: r.recipe ? `${r.recipe.name}${r.recipe.variation ? ` (${r.recipe.variation})` : ''}` : 'MISSING',
      'Serve (ml)': r.serve ?? '',
      'Price / L (£)': r.ppl ?? '',
      'RSP (£ inc VAT)': r.rsp ?? '',
      'Price / serve (£)': r.perServe !== null ? r2(r.perServe) : '',
      'Cost / L (£)': r.costPerLitre !== null ? r2(r.costPerLitre) : '',
      'Cost / serve (£)': r.costPerServe !== null ? r2(r.costPerServe) : '',
      'Our GP %': r.ourGp !== null ? Math.round(r.ourGp * 10) / 10 : '',
      'Their GP %': r.theirGp !== null ? Math.round(r.theirGp * 10) / 10 : '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Core range')
    XLSX.writeFile(wb, `foodlab-core-range-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const writingProduct = products.find((p) => p.id === writingFor)

  return (
    <div>
      {writingFor && writingProduct && (
        <RecipeEditor key={writingFor} presetProductId={writingFor} products={products.filter((p) => p.isActive !== false)}
          onSaved={async () => { await load() }} onClose={() => setWritingFor(null)} />
      )}

      <Header
        title="Core range"
        subtitle="The twenty drinks we sell everywhere — recipe, price, RSP, cost and margins in one place. Prices here are every drink's default."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/catalog?core=1"><Button size="sm" variant="ghost">Catalog</Button></Link>
            <Button size="sm" onClick={exportExcel} disabled={loading}>↓ Export to Excel</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { l: 'Drinks', v: `${rows.length}` },
          { l: 'With a recipe', v: `${withRecipe} of ${rows.length}`, warn: withRecipe < rows.length },
          { l: 'Priced (price + RSP)', v: `${priced} of ${rows.length}`, warn: priced < rows.length },
          { l: 'Average our GP', v: avgOur !== null ? `${avgOur.toFixed(1)}%` : '—' },
          { l: 'Average their GP', v: avgTheir !== null ? `${avgTheir.toFixed(1)}%` : '—' },
          { l: 'Filed elsewhere', v: `${tidy}`, warn: tidy > 0 },
        ].map((t) => (
          <div key={t.l} style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '12px 14px' }}>
            <p style={{ margin: 0, fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.l}</p>
            <p style={{ margin: '2px 0 0', fontSize: '22px', fontWeight: 600, color: t.warn ? '#b45309' : INK }}>{t.v}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12.5px', color: SECONDARY }}>
          Type in <strong>Serve</strong>, <strong>Price / L</strong> or <strong>RSP</strong> — it saves when you leave the box. Click a drink to see its recipes and anything filed under the wrong product.
        </span>
        <cols.ResetButton />
      </div>

      {loading ? (
        <p style={{ fontSize: '13px', color: MUTED }}>Loading…</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map((r) => {
                const isOpen = open === r.spec.name
                const flagged = r.dupProducts.length + r.strayRecipes.length
                return (
                  <React.Fragment key={r.spec.name}>
                    <tr style={{ borderTop: '1px solid #f3f4f6', background: isOpen ? '#fafafa' : undefined }}>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => setOpen(isOpen ? null : r.spec.name)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                          <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: INK }}>{r.spec.name}</span>
                          <span style={{ fontSize: '11px', color: MUTED, fontFamily: 'monospace' }}>
                            {r.product ? `${r.product.productCode}${r.product.name !== r.spec.name ? ` · ${r.product.name}` : ''}` : 'no product'}
                          </span>
                        </button>
                        {!r.product && <Button size="sm" onClick={() => makeProduct(r)} disabled={busy}>Create it</Button>}
                        {r.product && !r.product.isClassic && (
                          <button onClick={() => setField(r, { isClassic: true, isCoreRange: true }, 'flag')} style={{ display: 'block', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#b45309', textDecoration: 'underline' }}>
                            not marked core — fix
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                        {r.recipe ? (
                          <>
                            <Link href={`/recipes/${r.recipe.id}`} style={{ color: '#1d4ed8', fontWeight: 600 }}>{r.recipe.name}</Link>
                            <span style={{ display: 'block', fontSize: '11px', color: MUTED }}>{r.recipe.variation ?? 'house'}{r.recipeCount > 1 ? ` · ${r.recipeCount} recipes` : ''}</span>
                          </>
                        ) : r.product ? (
                          <button onClick={() => setWritingFor(r.product!.id)} style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '20px', padding: '3px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                            + Add recipe
                          </button>
                        ) : <span style={{ color: MUTED }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.product && <NumInput value={r.serve ?? undefined} decimals={0} width="64px" placeholder="ml" onSave={(n) => n && setField(r, { recommendedServingG: n }, 'serve')} />}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.product && (
                          <>
                            <NumInput value={r.ppl} width="84px" placeholder="£" onSave={(n) => setField(r, { defaultPricePerLitre: n }, 'price')} />
                            {r.pplFor80 !== null && (r.ppl === undefined || Math.abs(r.ppl - r.pplFor80) >= 0.01) && (
                              <button onClick={() => setField(r, { defaultPricePerLitre: r.pplFor80! }, 'price')} title={`The most per litre that leaves them ${VENUE_TARGET}% on the RSP`}
                                style={{ display: 'block', marginLeft: 'auto', marginTop: '3px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#1d4ed8', textDecoration: 'underline' }}>
                                {VENUE_TARGET}%: {money(r.pplFor80)}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.product && <NumInput value={r.rsp} width="76px" placeholder="£" onSave={(n) => setField(r, { defaultRsp: n }, 'RSP')} />}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.perServe !== null ? INK : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{r.perServe !== null ? money(r.perServe) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.costPerLitre !== null ? SECONDARY : '#b45309', fontVariantNumeric: 'tabular-nums' }} title={r.costNote}>
                        {r.costPerLitre !== null ? money(r.costPerLitre) : <span style={{ fontSize: '11px' }}>{r.costNote ?? '—'}</span>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.costPerServe !== null ? SECONDARY : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{r.costPerServe !== null ? money(r.costPerServe) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}><GpBadge value={r.ourGp} kind="ours" /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}><GpBadge value={r.theirGp} kind="venue" /></td>
                      <td style={{ padding: '10px 12px' }}>
                        {flagged
                          ? <button onClick={() => setOpen(isOpen ? null : r.spec.name)} style={{ border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: '20px', padding: '2px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>{flagged} to tidy</button>
                          : <span style={{ fontSize: '12px', color: '#166534' }}>✓</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={COLUMNS.length} style={{ padding: '12px 18px 16px', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px' }}>
                            <div>
                              <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipes on {r.product?.productCode ?? 'this drink'}</p>
                              {r.product && recipes.filter((x) => x.productId === r.product!.id).map((x) => (
                                <p key={x.id} style={{ margin: '3px 0', fontSize: '13px' }}>
                                  <Link href={`/recipes/${x.id}`} style={{ color: '#1d4ed8' }}>{x.name}</Link>
                                  <span style={{ color: MUTED }}> · {x.variation ?? 'house'}{x.id === r.recipe?.id ? ' · sets the cost' : ''}</span>
                                </p>
                              ))}
                              {r.recipeCount === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>None yet.</p>}
                              {r.product && <button onClick={() => setWritingFor(r.product!.id)} style={{ marginTop: '6px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '12.5px', color: '#1d4ed8', textDecoration: 'underline' }}>+ Add another recipe</button>}
                            </div>
                            <div>
                              <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipes called {r.spec.name} on other products</p>
                              {r.strayRecipes.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>None.</p>}
                              {r.strayRecipes.map((x) => {
                                const on = products.find((p) => p.id === x.productId)
                                return (
                                  <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '13px' }}>
                                    <span style={{ flex: 1 }}>
                                      <Link href={`/recipes/${x.id}`} style={{ color: '#1d4ed8' }}>{x.name}</Link>
                                      <span style={{ color: MUTED }}> · {x.variation ?? 'house'} · {on ? `on ${on.name} (${on.productCode})` : 'not linked to anything'}</span>
                                    </span>
                                    {r.product && <Button size="sm" variant="secondary" onClick={() => moveRecipe(r, x)}>Move it here</Button>}
                                  </div>
                                )
                              })}
                            </div>
                            <div>
                              <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Other products with the same name</p>
                              {r.dupProducts.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>None.</p>}
                              {r.dupProducts.map((p) => (
                                <p key={p.id} style={{ margin: '3px 0', fontSize: '13px', color: INK }}>
                                  {p.name} <span style={{ color: MUTED, fontFamily: 'monospace', fontSize: '11.5px' }}>{p.productCode}</span>
                                  <span style={{ color: p.isActive === false ? MUTED : '#b45309' }}> · {p.isActive === false ? 'already hidden' : 'still live'}</span>
                                  {' · '}{recipes.filter((x) => x.productId === p.id).length} recipe(s)
                                </p>
                              ))}
                              {r.dupProducts.some((p) => p.isActive !== false) && (
                                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: MUTED }}>Remove live duplicates from the Catalog (× on the row) once their recipes and prices are on the right product.</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: MUTED, lineHeight: 1.6 }}>
        Cost comes live from each drink&apos;s recipe. Our GP is price per litre against cost per litre. Their GP is on the RSP without VAT,
        against what the serve costs them from us — green at {VENUE_TARGET}%. Every account&apos;s price for these drinks starts from the price
        and RSP here; change it for one account on their price list.
      </p>
    </div>
  )
}
