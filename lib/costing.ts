import { Ingredient, Recipe, Product, Order } from '@/types'
import { normalizeIngredientName } from '@/lib/firestore/ingredients'

function r2(n: number) { return Math.round(n * 100) / 100 }
function r4(n: number) { return Math.round(n * 10000) / 10000 }

export interface RecipeCostLine {
  name: string
  ingredientId?: string
  qtyPer1L: number
  unit: string
  pricePerUnit: number | null   // £/kg or £/L — null when the ingredient has no price yet
  costPer1L: number | null
}

export interface RecipeCost {
  lines: RecipeCostLine[]
  costPerLitre: number
  complete: boolean             // false when any ingredient is unmatched or unpriced
  missingIngredients: string[]
}

// Match a recipe ingredient row to the ingredients library (by id first, then by name)
export function matchIngredient(
  row: { name: string; ingredientId?: string },
  ingredients: Ingredient[]
): Ingredient | undefined {
  if (row.ingredientId) {
    const byId = ingredients.find(i => i.id === row.ingredientId)
    if (byId) return byId
  }
  const key = normalizeIngredientName(row.name)
  return ingredients.find(i => i.nameKey === key)
}

// Cost of one litre of finished product, from ingredient prices
export function computeRecipeCost(recipe: Recipe, ingredients: Ingredient[]): RecipeCost {
  const lines: RecipeCostLine[] = []
  const missing: string[] = []
  let total = 0
  let complete = true

  for (const row of recipe.ingredients) {
    const ing = matchIngredient(row, ingredients)
    const priced = ing && ing.packPrice > 0 && ing.packSize > 0
    if (!priced) {
      complete = false
      missing.push(row.name)
      lines.push({ name: row.name, ingredientId: ing?.id, qtyPer1L: row.qtyPer1L, unit: row.unit, pricePerUnit: null, costPer1L: null })
      continue
    }
    const cost = r4(row.qtyPer1L * ing.pricePerUnit)
    total += cost
    lines.push({ name: row.name, ingredientId: ing.id, qtyPer1L: row.qtyPer1L, unit: row.unit, pricePerUnit: ing.pricePerUnit, costPer1L: cost })
  }

  return { lines, costPerLitre: r4(total), complete, missingIngredients: missing }
}

// Product.costToMake is per serving (recommendedServingG, treated 1g ≈ 1ml)
export function costPerServingFromLitre(costPerLitre: number, servingG: number): number {
  return r4((costPerLitre * servingG) / 1000)
}

// ── Ingredient usage for an order (drives stock deduction + shopping list) ───

export interface IngredientNeed {
  ingredientId: string
  ingredientName: string
  amount: number                // in the ingredient's packUnit (kg or L)
  packs: number                 // amount ÷ packSize
}

export function ingredientNeedsForOrder(
  order: Order,
  recipes: Recipe[],
  ingredients: Ingredient[]
): { needs: IngredientNeed[]; unrecipedProducts: string[] } {
  const acc = new Map<string, IngredientNeed>()
  const unreciped: string[] = []

  for (const item of order.lineItems) {
    const recipe = recipes.find(r => r.productId === item.productId)
    if (!recipe) { unreciped.push(item.productName); continue }
    const litres = item.quantity * (item.volumeLitres ?? 5)
    for (const row of recipe.ingredients) {
      const ing = matchIngredient(row, ingredients)
      if (!ing) continue
      const amount = row.qtyPer1L * litres
      const ex = acc.get(ing.id)
      if (ex) {
        ex.amount = r4(ex.amount + amount)
        ex.packs = ing.packSize > 0 ? r4(ex.amount / ing.packSize) : 0
      } else {
        acc.set(ing.id, {
          ingredientId: ing.id,
          ingredientName: ing.name,
          amount: r4(amount),
          packs: ing.packSize > 0 ? r4(amount / ing.packSize) : 0,
        })
      }
    }
  }
  return { needs: [...acc.values()], unrecipedProducts: [...new Set(unreciped)] }
}

// ── Shopping list — what to order, by when, for which orders ─────────────────

export interface ShoppingLine {
  ingredient: Ingredient
  requiredPacks: number
  stockPacks: number
  shortfallPacks: number        // > 0 means order more
  neededBy?: Date               // earliest delivery date among orders needing it
  forOrders: string[]           // order numbers driving the requirement
  estCost: number               // shortfall packs (rounded up) × pack price
}

export function buildShoppingList(
  upcomingOrders: Order[],      // orders not yet in production
  recipes: Recipe[],
  ingredients: Ingredient[]
): { lines: ShoppingLine[]; unrecipedProducts: string[] } {
  type Agg = { required: number; neededBy?: Date; orders: Set<string> }
  const agg = new Map<string, Agg>()
  const unreciped = new Set<string>()

  for (const order of upcomingOrders) {
    const { needs, unrecipedProducts } = ingredientNeedsForOrder(order, recipes, ingredients)
    unrecipedProducts.forEach(p => unreciped.add(p))
    const due = order.expectedDeliveryDate
    for (const n of needs) {
      const ex = agg.get(n.ingredientId) ?? { required: 0, orders: new Set<string>() }
      ex.required = r4(ex.required + n.packs)
      ex.orders.add(order.orderNumber)
      if (due && (!ex.neededBy || due < ex.neededBy)) ex.neededBy = due
      agg.set(n.ingredientId, ex)
    }
  }

  const lines: ShoppingLine[] = []
  for (const [id, a] of agg) {
    const ing = ingredients.find(i => i.id === id)
    if (!ing) continue
    const shortfall = r4(Math.max(0, a.required - ing.currentStock))
    lines.push({
      ingredient: ing,
      requiredPacks: a.required,
      stockPacks: ing.currentStock,
      shortfallPacks: shortfall,
      neededBy: a.neededBy,
      forOrders: [...a.orders],
      estCost: r2(Math.ceil(shortfall) * ing.packPrice),
    })
  }
  // Shortages first, then by needed-by date
  lines.sort((x, y) => (y.shortfallPacks > 0 ? 1 : 0) - (x.shortfallPacks > 0 ? 1 : 0) || (x.neededBy?.getTime() ?? Infinity) - (y.neededBy?.getTime() ?? Infinity))
  return { lines, unrecipedProducts: [...unreciped] }
}
