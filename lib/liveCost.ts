import { Ingredient, Product, Recipe, normalizeDrinkName } from '@/types'
import { computeRecipeCost } from '@/lib/costing'

/**
 * One cost, everywhere. A product's cost comes from its recipe, worked out
 * live — the catalog, the account price list and new orders all read it here,
 * so a recipe and the product it makes can never show different numbers.
 *
 * Some products have several recipes (a house spec and venue variants). The
 * one that sets the cost is the recipe named like the product, or failing that
 * the most recently updated — the same rule wherever a cost is shown or saved.
 */
export function primaryRecipe(product: Pick<Product, 'id' | 'name' | 'recipeId'>, recipes: Recipe[]): Recipe | undefined {
  // A recipe chosen by hand always wins.
  if (product.recipeId) {
    const chosen = recipes.find((r) => r.id === product.recipeId && r.status !== 'discontinued')
    if (chosen) return chosen
  }
  const linked = recipes.filter((r) => r.productId === product.id && r.status !== 'discontinued')
  if (linked.length <= 1) return linked[0]
  const key = normalizeDrinkName(product.name)
  return linked.find((r) => normalizeDrinkName(r.name) === key)
    ?? [...linked].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
}

export interface LiveCost {
  perLitre: number | null   // null when there is no honest number
  recipe?: Recipe
  fromRecipe: boolean       // false when it fell back to a cost typed on the product
  missing: string[]         // ingredients with no price, when the recipe is incomplete
}

export function liveCost(product: Product, recipes: Recipe[], ingredients: Ingredient[]): LiveCost {
  const recipe = primaryRecipe(product, recipes)
  if (recipe) {
    const c = computeRecipeCost(recipe, ingredients)
    return { perLitre: c.complete ? c.costPerLitre : null, recipe, fromRecipe: true, missing: c.missingIngredients }
  }
  // No recipe: a cost typed on the product is all there is.
  const typed = !product.costMissing && product.costToMake > 0 && product.recommendedServingG > 0
    ? (product.costToMake / product.recommendedServingG) * 1000
    : null
  return { perLitre: typed, fromRecipe: false, missing: [] }
}
