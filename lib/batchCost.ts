import { Ingredient, LaborBy, Product, Recipe } from '@/types'
import { computeRecipeCost, matchIngredient, toBaseAmount } from '@/lib/costing'
import { CostingSettings } from '@/lib/firestore/costingSettings'

/** £ an hour for whoever does the work. Dima's salary spread over a working year. */
export function hourlyRate(by: LaborBy | undefined, s: CostingSettings): number {
  if (by === 'edward') return s.edwardRate
  const hours = s.dimaHoursPerWeek * 52
  return hours > 0 ? s.dimaSalary / hours : 0
}

export function packagingPerLitre(s: CostingSettings): number {
  return s.packFormat === '5' ? s.bag5Price / 5 : s.bag20Price / 20
}

export interface BlendLabour {
  perUnit: number           // £ of labour in one kg/L of the blend, sub-blends included
  missing: string[]         // blends (this one or inside it) with no minutes yet
}

export function blendTimed(ing: Ingredient): boolean {
  return !!(ing.laborMinutes && ing.laborMinutes > 0 && ing.laborBatchSize && ing.laborBatchSize > 0)
}

/** Labour in one kg/L of a house blend: its own minutes over its batch, plus any blends it is made from. */
export function blendLabour(ing: Ingredient, all: Ingredient[], s: CostingSettings, depth = 0): BlendLabour {
  if (!ing.isProcess || depth > 5) return { perUnit: 0, missing: [] }
  const missing: string[] = []
  // Minutes only mean something against the batch they were timed on, so
  // both have to be in — the recipe's reference yield (often 1 kg) is not it.
  const batch = ing.laborBatchSize || 0
  let perUnit = 0
  if (blendTimed(ing)) {
    perUnit += (ing.laborMinutes! / 60) * hourlyRate(ing.laborBy, s) / batch
  } else {
    missing.push(ing.name)
  }
  for (const sub of ing.subIngredients ?? []) {
    const si = all.find((i) => i.id === sub.ingredientId)
    if (!si?.isProcess || !ing.packSize) continue
    const inner = blendLabour(si, all, s, depth + 1)
    perUnit += (toBaseAmount(sub.amount, sub.unit).value * inner.perUnit) / ing.packSize
    missing.push(...inner.missing)
  }
  return { perUnit, missing }
}

/** Every house blend a recipe leans on, directly or inside another blend. */
export function blendsIn(recipe: Recipe, all: Ingredient[]): Ingredient[] {
  const out = new Map<string, Ingredient>()
  const walk = (ing: Ingredient, depth: number) => {
    if (!ing.isProcess || depth > 5 || out.has(ing.id)) return
    out.set(ing.id, ing)
    for (const sub of ing.subIngredients ?? []) {
      const si = all.find((i) => i.id === sub.ingredientId)
      if (si) walk(si, depth + 1)
    }
  }
  for (const row of recipe.ingredients) {
    const ing = matchIngredient(row, all)
    if (ing) walk(ing, 0)
  }
  return [...out.values()]
}

export interface BatchCost {
  ingredientsPerLitre: number | null
  blendLabourPerLitre: number
  batchLabourPerLitre: number | null   // null until the drink's batch minutes are in
  packagingPerLitre: number
  totalPerLitre: number | null         // null while anything is missing
  missingLabour: string[]              // what still needs minutes
}

/** Cost of one litre when we make the drink at the planned batch size. */
export function batchCost(product: Product, recipe: Recipe | undefined, all: Ingredient[], s: CostingSettings, label = product.name): BatchCost {
  const packaging = packagingPerLitre(s)
  if (!recipe) return { ingredientsPerLitre: null, blendLabourPerLitre: 0, batchLabourPerLitre: null, packagingPerLitre: packaging, totalPerLitre: null, missingLabour: [] }
  const c = computeRecipeCost(recipe, all)
  const missing = new Set<string>()
  let blendPerLitre = 0
  for (const row of recipe.ingredients) {
    const ing = matchIngredient(row, all)
    if (!ing?.isProcess) continue
    const b = blendLabour(ing, all, s)
    blendPerLitre += row.qtyPer1L * b.perUnit
    b.missing.forEach((m) => missing.add(m))
  }
  const batchLabour = product.batchLaborMinutes && product.batchLaborMinutes > 0 && s.batchLitres > 0
    ? (product.batchLaborMinutes / 60) * hourlyRate(product.batchLaborBy, s) / s.batchLitres
    : null
  if (batchLabour === null) missing.add(`${label} batch`)
  const ingredients = c.complete ? c.costPerLitre : null
  const total = ingredients !== null && batchLabour !== null && missing.size === 0
    ? ingredients + blendPerLitre + batchLabour + packaging
    : null
  return { ingredientsPerLitre: ingredients, blendLabourPerLitre: blendPerLitre, batchLabourPerLitre: batchLabour, packagingPerLitre: packaging, totalPerLitre: total, missingLabour: [...missing] }
}
