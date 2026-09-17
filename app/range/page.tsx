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
import { getAllMenuDrinks } from '@/lib/firestore/menu'
import { getRollouts } from '@/lib/firestore/rollouts'
import { getAllPricing } from '@/lib/firestore/catalog'
import { getAllOrders } from '@/lib/firestore/orders'
import { syncProductCostForRecipe } from '@/lib/recipeSync'
import { computeRecipeCost } from '@/lib/costing'
import { getIngredients } from '@/lib/firestore/ingredients'
import { useTable, ColumnDef } from '@/hooks/useTable'
import { liveCost, primaryRecipe } from '@/lib/liveCost'
import { nextCode } from '@/lib/coreRange'
import {
  CORE_RANGE, CoreClassicSpec, Ingredient, Product, Recipe, MenuDrink, RolloutVenue, AccountPricing, Order,
  classicKeys, normalizeDrinkName, matchesClassic,
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
  { key: 'drink',   label: 'Drink',            width: 190, sortValue: (r) => r.order },
  { key: 'rsp',     label: 'RSP £ (inc VAT)',  width: 118, align: 'right', sortValue: (r) => r.rsp, descFirst: true },
  { key: 'ppl',     label: 'Price / L £',      width: 124, align: 'right', sortValue: (r) => r.ppl, descFirst: true },
  { key: 'serve',   label: 'Serve ml',         width: 92,  align: 'right', sortValue: (r) => r.serve, descFirst: true },
  { key: 'serveP',  label: 'Price / serve',    width: 100, align: 'right', sortValue: (r) => r.perServe, descFirst: true },
  { key: 'costS',   label: 'Cost / serve',     width: 96,  align: 'right', sortValue: (r) => r.costPerServe, descFirst: true },
  { key: 'ourGp',   label: 'Our GP',           width: 88,  align: 'right', sortValue: (r) => r.ourGp, descFirst: true },
  { key: 'theirGp', label: 'Venue GP',         width: 92,  align: 'right', sortValue: (r) => r.theirGp, descFirst: true },
  { key: 'costL',   label: 'Cost / L',         width: 90,  align: 'right', sortValue: (r) => r.costPerLitre, descFirst: true },
  { key: 'recipe',  label: 'Recipe',           width: 190, sortValue: (r) => (r.recipe ? r.recipe.name : null) },
  { key: 'dups',    label: 'Filed elsewhere',  width: 130, sortValue: (r) => r.dupProducts.length + r.strayRecipes.length, descFirst: true },
]

const money = (n: number) => `£${n.toFixed(2)}`
const r2 = (n: number) => Math.round(n * 100) / 100

export default function CoreRangePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [menuDrinks, setMenuDrinks] = useState<MenuDrink[]>([])
  const [venues, setVenues] = useState<RolloutVenue[]>([])
  const [pricing, setPricing] = useState<AccountPricing[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [writingFor, setWritingFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cols = useTable<Row>('core-range', COLUMNS)

  async function load() {
    const [p, r, i, m, v, pr, o] = await Promise.all([getProducts(), getRecipes(), getIngredients(), getAllMenuDrinks(), getRollouts(), getAllPricing(), getAllOrders()])
    setProducts(p); setRecipes(r); setIngredients(i); setMenuDrinks(m); setVenues(v); setPricing(pr); setOrders(o)
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

  // Where a recipe is in use: venue menus, account price lists, orders.
  function usageOf(r: Row, x: Recipe) {
    const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? 'a venue'
    const onMenus = menuDrinks.filter((d) =>
      d.recipeId === x.id ||
      (!d.recipeId && !!x.productId && d.productId === x.productId) ||
      (!d.recipeId && !d.productId && d.overlap === 'same' && d.classicName === r.spec.name && x.productId === r.product?.id)
    ).map((d) => `${venueName(d.venueId)} · ${d.name}`)
    const priceLists = x.productId ? [...new Set(pricing.filter((p) => p.productId === x.productId).map((p) => p.accountName))] : []
    const withIt = x.productId ? orders.filter((o) => o.status !== 'cancelled' && o.lineItems.some((li) => li.productId === x.productId)) : []
    const last = withIt.map((o) => o.createdAt).sort((a, b) => b.getTime() - a.getTime())[0]
    return { onMenus, priceLists, orderCount: withIt.length, last }
  }

  // One recipe sets the drink's cost. Choosing one filed elsewhere moves it here.
  async function chooseRecipe(r: Row, x: Recipe) {
    if (!r.product) return
    if (x.productId !== r.product.id) {
      const from = products.find((p) => p.id === x.productId)
      if (!confirm(`Use "${x.name}"${x.variation ? ` (${x.variation})` : ''} for ${r.spec.name}?${from ? `\n\nIt is linked to ${from.name} (${from.productCode}) now and will move to ${r.product.productCode}.` : ''}`)) return
      await updateRecipe(x.id, { productId: r.product.id, productCode: r.product.productCode, productName: r.product.name })
    }
    await updateProduct(r.product.id, { recipeId: x.id })
    await syncProductCostForRecipe({ ...x, productId: r.product.id })
    toast.success(`${r.spec.name} now costs from "${x.name}"${x.variation ? ` (${x.variation})` : ''}`)
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
          <strong>Yellow boxes are empty.</strong> Type each drink&apos;s <strong>RSP</strong>, <strong>Price / L</strong> and <strong>Serve</strong> straight into the row — it saves when you press Enter or click away. Click a drink to see its recipes and anything filed under the wrong product.
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
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.product && <NumInput value={r.rsp} width="90px" placeholder="type RSP" highlightEmpty onSave={(n) => setField(r, { defaultRsp: n }, 'RSP')} />}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.product && (
                          <>
                            <NumInput value={r.ppl} width="96px" placeholder="type price" highlightEmpty onSave={(n) => setField(r, { defaultPricePerLitre: n }, 'price')} />
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
                        {r.product && <NumInput value={r.serve ?? undefined} decimals={0} width="70px" placeholder="type ml" highlightEmpty onSave={(n) => n && setField(r, { recommendedServingG: n }, 'serve')} />}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.perServe !== null ? INK : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{r.perServe !== null ? money(r.perServe) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.costPerServe !== null ? SECONDARY : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>{r.costPerServe !== null ? money(r.costPerServe) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}><GpBadge value={r.ourGp} kind="ours" /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}><GpBadge value={r.theirGp} kind="venue" /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: r.costPerLitre !== null ? SECONDARY : '#b45309', fontVariantNumeric: 'tabular-nums' }} title={r.costNote}>
                        {r.costPerLitre !== null
                          ? <>{money(r.costPerLitre)}{!r.recipe && <span style={{ display: 'block', fontSize: '10.5px', color: '#b45309' }}>typed cost, no recipe</span>}</>
                          : <span style={{ fontSize: '11px' }}>{r.costNote ?? '—'}</span>}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                        {r.recipe ? (
                          <>
                            <Link href={`/recipes/${r.recipe.id}`} style={{ color: '#1d4ed8', fontWeight: 600 }}>{r.recipe.name}</Link>
                            <span style={{ display: 'block', fontSize: '11px', color: MUTED }}>
                              {r.recipe.variation ?? 'house'} · {r.product?.recipeId === r.recipe.id
                                ? <strong style={{ color: '#166534' }}>chosen</strong>
                                : r.recipeCount > 1 ? <strong style={{ color: '#b45309' }}>auto-picked of {r.recipeCount}</strong> : 'only one'}
                              {' · '}<button onClick={() => setOpen(isOpen ? null : r.spec.name)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#1d4ed8', textDecoration: 'underline' }}>compare ▾</button>
                            </span>
                          </>
                        ) : r.product ? (
                          <button onClick={() => setWritingFor(r.product!.id)} style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '20px', padding: '3px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                            + Add recipe
                          </button>
                        ) : <span style={{ color: MUTED }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {flagged
                          ? <button onClick={() => setOpen(isOpen ? null : r.spec.name)} style={{ border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: '20px', padding: '2px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>{flagged} to tidy</button>
                          : <span style={{ fontSize: '12px', color: '#166534' }}>✓</span>}
                      </td>
                    </tr>
                    {isOpen && (() => {
                      const candidates = [
                        ...(r.product ? recipes.filter((x) => x.productId === r.product!.id) : []),
                        ...r.strayRecipes,
                      ]
                      return (
                        <tr>
                          <td colSpan={COLUMNS.length} style={{ padding: '14px 18px 18px', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                              <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: INK }}>
                                {candidates.length ? `${candidates.length} recipe${candidates.length === 1 ? '' : 's'} for ${r.spec.name} — pick the one that sets its cost` : `No recipe for ${r.spec.name} yet`}
                              </p>
                              {r.product && <Button size="sm" variant="secondary" onClick={() => setWritingFor(r.product!.id)}>+ Add a recipe</Button>}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '12px' }}>
                              {candidates.map((x) => (
                                <RecipeCard
                                  key={x.id}
                                  recipe={x}
                                  ingredients={ingredients}
                                  sets={r.recipe?.id === x.id}
                                  chosen={r.product?.recipeId === x.id}
                                  filedOn={x.productId === r.product?.id ? undefined : (products.find((p) => p.id === x.productId) ?? null)}
                                  usage={usageOf(r, x)}
                                  onUse={() => chooseRecipe(r, x)}
                                />
                              ))}
                            </div>
                            {r.dupProducts.length > 0 && (
                              <div style={{ marginTop: '14px' }}>
                                <p style={{ margin: '0 0 6px', fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Other products with the same name</p>
                                {r.dupProducts.map((p) => (
                                  <p key={p.id} style={{ margin: '3px 0', fontSize: '13px', color: INK }}>
                                    {p.name} <span style={{ color: MUTED, fontFamily: 'monospace', fontSize: '11.5px' }}>{p.productCode}</span>
                                    <span style={{ color: p.isActive === false ? MUTED : '#b45309' }}> · {p.isActive === false ? 'hidden' : 'still live'}</span>
                                    {' · '}{recipes.filter((x) => x.productId === p.id).length} recipe(s) · {pricing.filter((x) => x.productId === p.id).length} price list(s)
                                  </p>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })()}
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

function RecipeCard({ recipe, ingredients, sets, chosen, filedOn, usage, onUse }: {
  recipe: Recipe
  ingredients: Ingredient[]
  sets: boolean
  chosen: boolean
  /** undefined when it is on this drink; the product it sits on otherwise (null = on nothing). */
  filedOn?: Product | null
  usage: { onMenus: string[]; priceLists: string[]; orderCount: number; last?: Date }
  onUse: () => void
}) {
  const [showLines, setShowLines] = useState(false)
  const c = computeRecipeCost(recipe, ingredients)
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${sets ? '#86efac' : '#e5e7eb'}`, borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/recipes/${recipe.id}`} style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{recipe.name}</Link>
          <span style={{ display: 'block', fontSize: '12px', color: SECONDARY }}>
            {recipe.variation ?? 'house'} · {recipe.ingredients.length} lines · {c.complete ? `${money(c.costPerLitre)}/L` : <span style={{ color: '#b45309' }}>unpriced: {c.missingIngredients.slice(0, 2).join(', ')}</span>}
          </span>
          {filedOn !== undefined && (
            <span style={{ display: 'block', fontSize: '11.5px', color: '#b45309' }}>
              {filedOn ? `filed on ${filedOn.name} (${filedOn.productCode})` : 'not linked to any product'}
            </span>
          )}
        </div>
        {sets
          ? <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#dcfce7', color: '#166534', whiteSpace: 'nowrap' }}>✓ sets the cost{chosen ? '' : ' (auto)'}</span>
          : <Button size="sm" onClick={onUse}>Use this one</Button>}
      </div>
      {sets && !chosen && <button onClick={onUse} style={{ marginTop: '6px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', color: '#1d4ed8', textDecoration: 'underline' }}>Lock it in as the one</button>}

      <div style={{ marginTop: '8px', fontSize: '12px', color: SECONDARY, lineHeight: 1.55 }}>
        <div><strong style={{ color: INK }}>On menus:</strong> {usage.onMenus.length ? usage.onMenus.join(' · ') : 'none'}</div>
        <div><strong style={{ color: INK }}>Price lists:</strong> {usage.priceLists.length ? usage.priceLists.join(', ') : 'none'}</div>
        <div><strong style={{ color: INK }}>Orders:</strong> {usage.orderCount ? `${usage.orderCount}${usage.last ? `, last ${format(usage.last, 'd MMM yyyy')}` : ''}` : 'none'}</div>
      </div>

      <button onClick={() => setShowLines((v) => !v)} style={{ marginTop: '6px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', color: '#1d4ed8', textDecoration: 'underline' }}>
        {showLines ? 'Hide ingredients' : 'Show ingredients'}
      </button>
      {showLines && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '6px' }}>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={l.name + i} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '4px 6px 4px 0', color: INK }}>{l.name}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: SECONDARY, whiteSpace: 'nowrap' }}>{l.qtyPer1L.toFixed(l.qtyPer1L < 1 ? 3 : 1)} {l.unit}/L</td>
                <td style={{ padding: '4px 0', textAlign: 'right', color: l.costPer1L === null ? '#b45309' : SECONDARY, whiteSpace: 'nowrap' }}>{l.costPer1L === null ? 'no price' : money(l.costPer1L)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
