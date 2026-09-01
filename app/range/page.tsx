'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getProducts, updateProduct, createProduct } from '@/lib/firestore/catalog'
import { getRecipes, createRecipe } from '@/lib/firestore/recipes'
import { CLASSIC_RECIPES, classicKey } from '@/lib/data/classicRecipes'
import { getIngredients } from '@/lib/firestore/ingredients'
import { computeRecipeCost } from '@/lib/costing'
import { useTable, ColumnDef } from '@/hooks/useTable'
import { Product, Recipe, Ingredient } from '@/types'
import toast from 'react-hot-toast'

const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}

function money(n: number) { return '£' + n.toFixed(2) }

// "Dry Martini" against "Passionfruit Martini" — enough overlap to be linked,
// not enough to be the same drink.
function namesAgree(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\btms\b|\bfl\b/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return true
  return x === y || x.includes(y) || y.includes(x)
}

interface Row {
  product: Product
  recipes: Recipe[]
  costs: number[]
  lowCost: number | null
  highCost: number | null
  spread: number
  issues: string[]
}

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'star',    label: '★',        width: 40,  align: 'center', sortValue: (r) => (r.product.isClassic ? 0 : 1) },
  { key: 'name',    label: 'Drink',    width: 250, sortValue: (r) => r.product.name },
  { key: 'code',    label: 'Code',     width: 110, sortValue: (r) => r.product.productCode },
  { key: 'cat',     label: 'Category', width: 124, sortValue: (r) => r.product.category },
  { key: 'recipes', label: 'Recipes',  width: 88,  align: 'right', sortValue: (r) => r.recipes.length, descFirst: true },
  { key: 'cost',    label: 'Cost / L', width: 150, align: 'right', sortValue: (r) => r.lowCost, descFirst: true },
  { key: 'issues',  label: 'Needs a look', width: 260, sortValue: (r) => r.issues.length, descFirst: true },
]

export default function RangePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)

  const cols = useTable<Row>('range', COLUMNS)

  function load() {
    Promise.all([getProducts(), getRecipes(), getIngredients()])
      .then(([p, r, i]) => { setProducts(p); setRecipes(r); setIngredients(i) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // One row per product. A product with three venue variants is still one drink,
  // which is why the recipe list reads as duplicates and this does not.
  const rows = useMemo<Row[]>(() => {
    return products
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const rs = recipes.filter((r) => r.productId === p.id)
        const costs = rs
          .map((r) => computeRecipeCost(r, ingredients))
          .filter((c) => c.complete)
          .map((c) => c.costPerLitre)
        const lowCost = costs.length ? Math.min(...costs) : null
        const highCost = costs.length ? Math.max(...costs) : null

        const issues: string[] = []
        if (rs.length === 0) issues.push('No recipe')
        if (rs.length > 1) issues.push(`${rs.length} recipes on one product`)
        const mislinked = rs.filter((r) => !namesAgree(r.name, p.name))
        if (mislinked.length) issues.push(`Linked to “${mislinked[0].name}”`)
        if (rs.length && costs.length === 0) issues.push('Not costed')
        if (lowCost !== null && highCost !== null && lowCost > 0 && highCost / lowCost > 1.5) {
          issues.push('Variants disagree on cost')
        }
        if (!p.recommendedServingG || p.recommendedServingG === 100) issues.push('Serve size unconfirmed')

        return {
          product: p, recipes: rs, costs, lowCost, highCost,
          spread: lowCost && highCost ? highCost - lowCost : 0,
          issues,
        }
      })
      .filter((r) => {
        const q = search.toLowerCase()
        const match = !q || r.product.name.toLowerCase().includes(q) || r.product.productCode.toLowerCase().includes(q)
        return match && (!onlyIssues || r.issues.length > 0)
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [products, recipes, ingredients, search, onlyIssues])

  const picked = products.filter((p) => p.isActive !== false && p.isClassic)

  // The costing sheet's eleven against what actually exists as a product here.
  // Several of the classics have only ever been a row in a spreadsheet.
  const missingClassics = useMemo(() => {
    const have = new Set(products.filter((p) => p.isActive !== false).map((p) => classicKey(p.name)))
    return CLASSIC_RECIPES.filter((c) => !have.has(classicKey(c.name)))
  }, [products])

  // Build the product and its recipe from the sheet, then star it.
  async function createMissing() {
    if (!missingClassics.length) return
    if (!confirm(
      `Create ${missingClassics.length} product${missingClassics.length === 1 ? '' : 's'} from the costing sheet?\n\n` +
      missingClassics.map((c) => '· ' + c.name).join('\n') +
      '\n\nEach gets its recipe and is added to the range. Ingredient prices come from the library, so anything unpriced shows as unpriced.'
    )) return

    setBusy(true)
    try {
      // Codes are not generated for us, so continue the FL-1000xx series.
      let next = products
        .map((p) => Number(/FL-(\d+)/.exec(p.productCode)?.[1] ?? 0))
        .filter((n) => n >= 100000 && n < 200000)
        .reduce((a, b) => Math.max(a, b), 100000)

      for (const c of missingClassics) {
        next += 1
        const productCode = `FL-${next}`
        const productId = await createProduct({
          productCode,
          name: c.name,
          category: 'Other',
          costToMake: 0,
          costMissing: true,
          recommendedServingG: 100,
          volumeLitres: 5,
          baseCode: productCode,
          isNonAlcoholic: false,
          isCoreRange: false,
          isClassic: true,
          isActive: true,
        } as Parameters<typeof createProduct>[0])

        await createRecipe({
          name: c.name,
          productId,
          productName: c.name,
          productCode,
          ingredients: c.ingredients.map((i) => ({
            name: i.name,
            unit: 'L',
            qtyPer1000L: (i.amountPerBatchMl / c.batchMl) * 1000,
            qtyPer1L: i.amountPerBatchMl / c.batchMl,
          })),
          analyticalValues: [],
          cookingInstructions: '',
          status: 'active',
        } as Parameters<typeof createRecipe>[0])
      }
      load()
      toast.success(`${missingClassics.length} created`)
    } catch (e) {
      toast.error('Could not create them all — ' + String(e))
    } finally { setBusy(false) }
  }

  async function toggle(p: Product) {
    setBusy(true)
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isClassic: !p.isClassic } : x)))
    try { await updateProduct(p.id, { isClassic: !p.isClassic }) } finally { setBusy(false) }
  }

  async function clearAll() {
    if (!picked.length) return
    if (!confirm(`Clear the current selection of ${picked.length}?\n\nNothing is deleted — the drinks stay, they just stop being the core range.`)) return
    setBusy(true)
    try {
      for (const p of picked) await updateProduct(p.id, { isClassic: false })
      setProducts(await getProducts())
      toast.success('Selection cleared')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <Header
        title="Core classics"
        subtitle="One row per drink. Star the ones we are building the range on — everything downstream follows this list."
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button size="sm" variant="secondary" onClick={clearAll} disabled={busy || !picked.length}>
              Clear selection
            </Button>
            <Link href="/pricing"><Button size="sm" disabled={!picked.length}>Price these {picked.length} →</Button></Link>
          </div>
        }
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px',
      }}>
        {[
          { k: 'Drinks on the platform', v: String(products.filter((p) => p.isActive !== false).length) },
          { k: 'Selected', v: String(picked.length), warn: picked.length === 0 },
          { k: 'Recipes behind them', v: String(recipes.filter((r) => picked.some((p) => p.id === r.productId)).length) },
          { k: 'Needing a look', v: String(rows.filter((r) => r.issues.length).length), warn: rows.some((r) => r.issues.length) },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '11px 13px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: s.warn ? '#b45309' : '#111827' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {missingClassics.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 18px', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>
            {missingClassics.length} of the eleven classics on your costing sheet do not exist here
          </p>
          <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#b91c1c', lineHeight: 1.55, maxWidth: '80ch' }}>
            {missingClassics.map((c) => c.name).join(' · ')} — they are costed on the sheet but have no product,
            so they cannot be starred, priced or put on a rate card. That is why the range looks incomplete.
          </p>
          <Button size="sm" onClick={createMissing} loading={busy} disabled={busy}>
            Create them from the costing sheet
          </Button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px', marginBottom: '16px' }}>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.6, color: '#4b5563', maxWidth: '84ch' }}>
          The recipe list looks duplicated because it is a list of <strong style={{ color: '#111827' }}>recipes</strong>,
          and one drink can have several — a house version plus a Spring Street and a Pyro variant, all on the same
          product code. This is a list of <strong style={{ color: '#111827' }}>drinks</strong>, so each appears once
          with its variants counted. Where two genuinely different drinks share a product code, or a recipe is linked
          to a product it is not, it is flagged on the right.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search drinks…"
          style={{ width: '260px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Only ones needing a look
        </label>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{rows.length} shown</span>
        <cols.ResetButton />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map((r) => (
                <tr key={r.product.id} style={{ borderBottom: '1px solid #f9fafb', background: r.product.isClassic ? '#fffdf5' : undefined }}>
                  <td style={{ ...td, textAlign: 'center', padding: '10px 4px' }}>
                    <button
                      onClick={() => toggle(r.product)}
                      disabled={busy}
                      title={r.product.isClassic ? 'Remove from the range' : 'Add to the range'}
                      style={{
                        border: 'none', background: 'none', cursor: busy ? 'default' : 'pointer',
                        fontSize: '16px', lineHeight: 1, padding: '2px',
                        color: r.product.isClassic ? '#d97706' : '#e5e7eb',
                      }}
                    >★</button>
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#111827' }}>{r.product.name}</td>
                  <td style={{ ...td, textAlign: 'left', color: '#9ca3af', fontFamily: 'monospace', fontSize: '12px' }}>{r.product.productCode}</td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    {r.product.category
                      ? <span style={{ fontSize: '11.5px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#4b5563' }}>{r.product.category}</span>
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td style={{ ...td, color: r.recipes.length === 0 ? '#dc2626' : r.recipes.length > 1 ? '#b45309' : '#6b7280', fontWeight: r.recipes.length !== 1 ? 700 : 400 }}>
                    {r.recipes.length}
                  </td>
                  <td style={td}>
                    {r.lowCost === null ? <span style={{ color: '#d1d5db' }}>—</span>
                      : r.highCost !== null && r.highCost > r.lowCost
                        ? <span>{money(r.lowCost)} <span style={{ color: '#9ca3af' }}>–</span> {money(r.highCost)}</span>
                        : money(r.lowCost)}
                  </td>
                  <td className="dt-wrap" style={{ ...td, textAlign: 'left' }}>
                    {r.issues.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#16a34a' }}>✓</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {r.issues.map((i) => (
                          <span key={i} style={{
                            fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '20px',
                            background: i === 'No recipe' ? '#fee2e2' : '#fef3c7',
                            color: i === 'No recipe' ? '#991b1b' : '#92400e',
                          }}>{i}</span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '14px', lineHeight: 1.6, maxWidth: '84ch' }}>
        Starring sets the same flag the rate card and the pricing finalizer read, so this is the one list the range
        is built from. <strong style={{ color: '#6b7280' }}>Clearing the selection deletes nothing</strong> — the drinks
        and their recipes stay exactly where they are, they simply stop being the core range.
      </p>
    </div>
  )
}
