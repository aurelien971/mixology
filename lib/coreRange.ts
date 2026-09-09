import {
  Product, Recipe, CoreClassicSpec, CORE_RANGE, classicKeys, normalizeDrinkName,
} from '@/types'
import { createProduct, updateProduct } from '@/lib/firestore/catalog'

/**
 * Setting up the core classics range.
 *
 * The twenty drinks are the target; the catalog is whatever has accumulated.
 * Matching is deliberately strict — an exact name or a spelling we have listed
 * as an alias. Anything looser and "Mango Chutney Margarita" quietly becomes
 * the Margarita, which is exactly how six of the last eleven got mislinked.
 * Everything else is created fresh, so a near-miss costs a duplicate you can
 * see rather than a wrong link you cannot.
 */

export type RangeState = 'linked' | 'match' | 'create'

export interface RangeRow {
  spec: CoreClassicSpec
  product?: Product
  recipe?: Recipe
  /** linked = already in the range · match = exists, needs the flag · create = not in the catalog */
  state: RangeState
  hasRecipe: boolean
}

function findProduct(spec: CoreClassicSpec, products: Product[]): Product | undefined {
  const keys = classicKeys(spec)
  const live = products.filter((p) => p.isActive !== false)
  // An exact hit on any spelling, preferring one already in the range.
  const hits = live.filter((p) => keys.includes(normalizeDrinkName(p.name)))
  return hits.find((p) => p.isClassic) ?? hits[0]
}

export function reconcileCoreRange(products: Product[], recipes: Recipe[]): RangeRow[] {
  return CORE_RANGE.map((spec) => {
    const product = findProduct(spec, products)
    const recipe = product
      ? recipes.find((r) => r.productId === product.id)
      : recipes.find((r) => classicKeys(spec).includes(normalizeDrinkName(r.name)))
    return {
      spec,
      product,
      recipe,
      state: !product ? 'create' : product.isClassic ? 'linked' : 'match',
      hasRecipe: !!recipe,
    }
  })
}

/** Drinks carrying the classic flag that are not one of the twenty. */
export function strays(products: Product[]): Product[] {
  const keys = new Set(CORE_RANGE.flatMap(classicKeys))
  return products.filter((p) => p.isClassic && !keys.has(normalizeDrinkName(p.name)))
}

function nextCode(products: Product[]): number {
  const nums = products
    .map((p) => parseInt((p.productCode || '').replace('FL-', ''), 10))
    .filter((n) => Number.isFinite(n))
  return nums.length ? Math.max(...nums) + 1 : 100001
}

export interface RangeResult { flagged: number; created: number }

/**
 * Put all twenty in the range: flag what exists, create what does not.
 * Codes carry on from the highest one in the catalog so they stay unique.
 */
export async function applyCoreRange(rows: RangeRow[], products: Product[]): Promise<RangeResult> {
  const result: RangeResult = { flagged: 0, created: 0 }
  let n = nextCode(products)

  for (const row of rows) {
    if (row.state === 'match' && row.product) {
      await updateProduct(row.product.id, { isClassic: true })
      result.flagged++
    } else if (row.state === 'create') {
      const code = `FL-${n++}`
      await createProduct({
        productCode: code,
        baseCode: code,
        name: row.spec.name,
        category: row.spec.category,
        recommendedServingG: 100,
        volumeLitres: 5,
        costToMake: 0,
        costMissing: true,          // no recipe yet, so no honest cost
        isNonAlcoholic: !!row.spec.nonAlcoholic,
        isCoreRange: true,
        isClassic: true,
        isActive: true,
      })
      result.created++
    }
  }
  return result
}
