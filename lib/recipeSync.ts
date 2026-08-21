import { Recipe, Ingredient } from '@/types'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients, updateIngredient } from '@/lib/firestore/ingredients'
import { updateProduct } from '@/lib/firestore/catalog'
import { getProducts } from '@/lib/firestore/catalog'
import { computeRecipeCost, costPerServingFromLitre, computeProcessCost } from '@/lib/costing'

// Re-derive every process ingredient's price from its sub-ingredients.
// Call before recomputing product costs so recipes using processes get fresh numbers.
export async function recomputeProcessPrices(preloaded?: Ingredient[]): Promise<Ingredient[]> {
  let all = preloaded ?? await getIngredients()
  let changed = false
  for (const proc of all.filter(i => i.isProcess)) {
    const c = computeProcessCost(proc, all)
    if (c.complete && Math.abs(c.total - proc.packPrice) > 0.005) {
      await updateIngredient(proc.id, { packPrice: c.total })
      changed = true
    }
  }
  if (changed) all = await getIngredients()
  return all
}

// Push the recipe-calculated cost into the linked catalog product.
// Wherever a recipe exists, catalog cost is CALCULATED — never typed in.
export async function syncProductCostForRecipe(
  recipe: Recipe,
  preloaded?: { ingredients: Ingredient[] }
): Promise<boolean> {
  if (!recipe.productId) return false
  const ingredients = preloaded?.ingredients ?? await getIngredients()
  const cost = computeRecipeCost(recipe, ingredients)
  if (!cost.complete) {
    // Some ingredients unpriced — flag as missing rather than writing a wrong number
    await updateProduct(recipe.productId, { costMissing: true })
    return false
  }
  const products = await getProducts()
  const product = products.find(p => p.id === recipe.productId)
  const servingG = product?.recommendedServingG || 200
  await updateProduct(recipe.productId, {
    costToMake: costPerServingFromLitre(cost.costPerLitre, servingG),
    costMissing: false,
  })
  return true
}

// Recompute every linked product's cost — call after ingredient prices change.
export async function recomputeAllProductCosts(): Promise<{ updated: number; incomplete: number }> {
  const [recipes, rawIngredients, products] = await Promise.all([getRecipes(), getIngredients(), getProducts()])
  const ingredients = await recomputeProcessPrices(rawIngredients)
  let updated = 0, incomplete = 0
  for (const recipe of recipes) {
    if (!recipe.productId) continue
    const cost = computeRecipeCost(recipe, ingredients)
    const product = products.find(p => p.id === recipe.productId)
    if (!product) continue
    if (!cost.complete) { incomplete++; await updateProduct(product.id, { costMissing: true }); continue }
    const servingG = product.recommendedServingG || 200
    await updateProduct(product.id, {
      costToMake: costPerServingFromLitre(cost.costPerLitre, servingG),
      costMissing: false,
    })
    updated++
  }
  return { updated, incomplete }
}
