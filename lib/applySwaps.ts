import { Ingredient, Recipe } from '@/types'
import { findIngredientMatch } from '@/lib/costing'
import { Swap, sourceNames } from '@/lib/data/swaps'
import { LWC_REBATE } from '@/lib/lwcSync'
import { findOrCreateIngredient, updateIngredient, getIngredients } from '@/lib/firestore/ingredients'
import { updateRecipe } from '@/lib/firestore/recipes'

/**
 * Dispatching a swap.
 *
 * Re-pricing the old bottle is not a swap — it leaves every recipe still calling
 * for Ojo de Tigre while quietly charging Del Maguey's price. A swap has to
 * repoint the recipe lines themselves. Once they reference the new ingredient,
 * costing, the rate card and pricing all move on their own, because every one
 * of them reads the same recipes and the same library.
 */

export interface SwapLine {
  recipe: Recipe
  /** Indices of the ingredient rows that reference the outgoing product. */
  rows: number[]
  costBefore: number | null
  costAfter: number | null
}

export interface SwapPlan {
  swap: Swap
  source: Ingredient | null
  /** The replacement in our library, when it is already there. */
  target: Ingredient | null
  /** What the replacement should cost per pack once applied. */
  targetPackPrice: number
  targetPackSize: number
  affected: SwapLine[]
  lineCount: number
  /** True when the replacement has to be added to the library first. */
  createsIngredient: boolean
  /** True when the replacement is there but priced differently to the trade list. */
  repricesIngredient: boolean
}

/**
 * Does this recipe row call for the product we are swapping out?
 *
 * A row can name the ingredient directly, point at it by id, or use one of its
 * other spellings — all three have to count, or a swap silently does nothing.
 */
export function matchesSource(
  row: { name: string; ingredientId?: string },
  swap: Swap,
  source: Ingredient | null,
  lib: Ingredient[]
): boolean {
  if (source && row.ingredientId === source.id) return true
  // Picked by hand: match that ingredient and nothing else, so an override is
  // not quietly widened by the name rules below.
  if (swap.fromIngredientId) {
    if (row.ingredientId === swap.fromIngredientId) return true
    return findIngredientMatch(row.name, lib)?.id === swap.fromIngredientId
  }
  const viaName = findIngredientMatch(row.name, lib)
  if (source && viaName?.id === source.id) return true
  // The row may name the product without the library holding it at all.
  return sourceNames(swap).some((n) => {
    const a = n.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    const b = row.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
  })
}

function costOf(recipe: Recipe, lib: Ingredient[]): number | null {
  let total = 0
  let any = false
  for (const row of recipe.ingredients) {
    const ing = row.ingredientId
      ? lib.find((i) => i.id === row.ingredientId) ?? findIngredientMatch(row.name, lib)
      : findIngredientMatch(row.name, lib)
    if (!ing || !(ing.pricePerUnit > 0)) continue
    total += row.qtyPer1L * ing.pricePerUnit
    any = true
  }
  return any ? Math.round(total * 10000) / 10000 : null
}

/**
 * What each swap would do, without doing any of it.
 */
/** The outgoing ingredient for a swap, by whichever route finds it. */
export function resolveSource(swap: Swap, ingredients: Ingredient[]): Ingredient | null {
  if (swap.fromIngredientId) return ingredients.find((i) => i.id === swap.fromIngredientId) ?? null
  return sourceNames(swap).map((n) => findIngredientMatch(n, ingredients)).find(Boolean) ?? null
}

export function planSwaps(
  swaps: Swap[],
  ingredients: Ingredient[],
  recipes: Recipe[],
  applyRebate = true
): SwapPlan[] {
  return swaps.map((swap) => {
    // A hand-picked ingredient wins; otherwise try every name this product is
    // filed under, since the trade description and the shelf label rarely match.
    const source = (swap.fromIngredientId
      ? ingredients.find((i) => i.id === swap.fromIngredientId)
      : sourceNames(swap).map((n) => findIngredientMatch(n, ingredients)).find(Boolean)) ?? null
    const target = findIngredientMatch(swap.to, ingredients) ?? null

    const perLitre = (swap.toLitres > 0 ? swap.toPrice / swap.toLitres : 0) * (applyRebate ? 1 - LWC_REBATE : 1)
    const targetPackSize = target?.packSize && target.packUnit === 'L' ? target.packSize : swap.toLitres
    const targetPackPrice = Math.round(perLitre * targetPackSize * 100) / 100

    // The library as it would be afterwards, so the cost delta is the real one.
    const after: Ingredient[] = ingredients.map((i) => {
      if (target && i.id === target.id) {
        return { ...i, packPrice: targetPackPrice, pricePerUnit: targetPackSize > 0 ? targetPackPrice / targetPackSize : 0 }
      }
      return i
    })
    if (!target && source) {
      // Stand-in for the ingredient that would be created.
      after.push({
        ...source,
        id: '__pending__',
        name: swap.to,
        nameKey: swap.to.toLowerCase(),
        packSize: targetPackSize,
        packUnit: 'L',
        packPrice: targetPackPrice,
        pricePerUnit: targetPackSize > 0 ? targetPackPrice / targetPackSize : 0,
      })
    }

    const affected: SwapLine[] = []
    for (const recipe of recipes) {
      const rows: number[] = []
      recipe.ingredients.forEach((row, i) => {
        if (matchesSource(row, swap, source, ingredients)) rows.push(i)
      })
      if (!rows.length) continue

      // Cost the recipe as it would read once the rows point at the replacement.
      const swapped: Recipe = {
        ...recipe,
        ingredients: recipe.ingredients.map((row, i) =>
          rows.includes(i) ? { ...row, name: swap.to, ingredientId: target?.id ?? '__pending__' } : row
        ),
      }
      affected.push({
        recipe,
        rows,
        costBefore: costOf(recipe, ingredients),
        costAfter: costOf(swapped, after),
      })
    }

    return {
      swap, source, target, targetPackPrice, targetPackSize, affected,
      lineCount: affected.reduce((s, a) => s + a.rows.length, 0),
      createsIngredient: !target,
      repricesIngredient: !!target && Math.abs(target.packPrice - targetPackPrice) >= 0.01,
    }
  })
}

export interface SwapResult {
  ingredientsCreated: number
  ingredientsRepriced: number
  recipesUpdated: number
  linesUpdated: number
}

/**
 * Do it. Ingredients first so the recipe rows have something to point at.
 *
 * The outgoing ingredient is left alone — it may still be on the shelf, and
 * deleting it would orphan stock movements and past orders.
 */
export async function executeSwaps(plans: SwapPlan[]): Promise<SwapResult> {
  const result: SwapResult = { ingredientsCreated: 0, ingredientsRepriced: 0, recipesUpdated: 0, linesUpdated: 0 }
  let library = await getIngredients()

  for (const plan of plans) {
    if (!plan.lineCount) continue

    const { id: targetId, created } = await findOrCreateIngredient(plan.swap.to, library, {
      packDescription: `${plan.targetPackSize}L`,
      packSize: plan.targetPackSize,
      packUnit: 'L',
      packPrice: plan.targetPackPrice,
      supplier: plan.source?.supplier ?? 'LWC',
    })
    if (created) {
      result.ingredientsCreated++
      library = await getIngredients()
    } else if (plan.repricesIngredient) {
      await updateIngredient(targetId, { packPrice: plan.targetPackPrice, packSize: plan.targetPackSize })
      result.ingredientsRepriced++
    }

    for (const line of plan.affected) {
      const next = line.recipe.ingredients.map((row, i) =>
        line.rows.includes(i) ? { ...row, name: plan.swap.to, ingredientId: targetId } : row
      )
      await updateRecipe(line.recipe.id, { ingredients: next })
      result.recipesUpdated++
      result.linesUpdated += line.rows.length
    }
  }

  return result
}
