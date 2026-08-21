import { Ingredient, Recipe, Order, RecipeUnit } from '@/types'
import { normalizeIngredientName } from '@/lib/firestore/ingredients'

function r2(n: number) { return Math.round(n * 100) / 100 }
function r4(n: number) { return Math.round(n * 10000) / 10000 }

// Convert a recipe/process amount to base units (kg / L / unit)
export function toBaseAmount(amount: number, unit: RecipeUnit): { value: number; base: 'KG' | 'L' | 'UNIT' } {
  switch (unit) {
    case 'g':    return { value: amount / 1000, base: 'KG' }
    case 'kg':   return { value: amount, base: 'KG' }
    case 'ml':   return { value: amount / 1000, base: 'L' }
    case 'L':    return { value: amount, base: 'L' }
    case 'unit': return { value: amount, base: 'UNIT' }
  }
}

// Cost of making one batch of a process ingredient from its sub-ingredients
export function computeProcessCost(
  proc: Pick<Ingredient, 'subIngredients' | 'packSize'>,
  all: Ingredient[]
): { total: number; perYieldUnit: number; complete: boolean; missing: string[] } {
  let total = 0
  const missing: string[] = []
  for (const sub of proc.subIngredients ?? []) {
    const ing = all.find(i => i.id === sub.ingredientId)
    if (!ing || !(ing.pricePerUnit > 0)) { missing.push(sub.name); continue }
    total += toBaseAmount(sub.amount, sub.unit).value * ing.pricePerUnit
  }
  const yieldAmount = proc.packSize || 0
  return {
    total: r2(total),
    perYieldUnit: yieldAmount > 0 ? r4(total / yieldAmount) : 0,
    complete: missing.length === 0 && (proc.subIngredients?.length ?? 0) > 0,
    missing,
  }
}

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

// Fuzzy name → ingredient matcher. Handles the "Sugar syrup" vs "Sugar Syrup TMS"
// mismatch between cocktail sheets and house-blend names: exact key first, then
// key with TMS/underscore junk stripped, then unambiguous containment.
export function findIngredientMatch(name: string, ingredients: Ingredient[]): Ingredient | undefined {
  const key = normalizeIngredientName(name)
  if (!key) return undefined
  const exact = ingredients.find(i => i.nameKey === key)
  if (exact) return exact
  const strip = (x: string) => x.replace(/\btms\b/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  const k = strip(key)
  const stripped = ingredients.find(i => strip(i.nameKey) === k)
  if (stripped) return stripped
  if (k.length < 5) return undefined  // too short for safe containment ("hay", "gin"…)
  const contains = ingredients.filter(i => {
    const ik = strip(i.nameKey)
    return ik.includes(k) || k.includes(ik)
  })
  return contains.length === 1 ? contains[0] : undefined
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
  return findIngredientMatch(row.name, ingredients)
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

  function addNeed(ing: Ingredient, amount: number) {
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

  for (const item of order.lineItems) {
    const recipe = recipes.find(r => r.productId === item.productId)
    if (!recipe) { unreciped.push(item.productName); continue }
    const litres = item.quantity * (item.volumeLitres ?? 5)
    for (const row of recipe.ingredients) {
      const ing = matchIngredient(row, ingredients)
      if (!ing) continue
      const amount = row.qtyPer1L * litres
      // Processes are made in-house — what we actually buy is their sub-ingredients
      if (ing.isProcess && ing.subIngredients?.length && ing.packSize > 0) {
        const batches = amount / ing.packSize
        for (const sub of ing.subIngredients) {
          const subIng = ingredients.find(x => x.id === sub.ingredientId)
          if (!subIng) continue
          addNeed(subIng, toBaseAmount(sub.amount, sub.unit).value * batches)
        }
      } else {
        addNeed(ing, amount)
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
