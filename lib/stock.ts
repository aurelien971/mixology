import { Order, Recipe, Ingredient } from '@/types'
import { getRecipes } from '@/lib/firestore/recipes'
import { getIngredients, recordStockMovement } from '@/lib/firestore/ingredients'
import { updateOrder } from '@/lib/firestore/orders'
import { ingredientNeedsForOrder } from '@/lib/costing'

// Deduct ingredient stock when an order enters production. Idempotent via order.stockDeducted.
export async function deductStockForOrder(
  order: Order,
  preloaded?: { recipes: Recipe[]; ingredients: Ingredient[] }
): Promise<{ deducted: number; unrecipedProducts: string[] }> {
  if (order.stockDeducted) return { deducted: 0, unrecipedProducts: [] }

  const recipes = preloaded?.recipes ?? await getRecipes()
  const ingredients = preloaded?.ingredients ?? await getIngredients()
  const { needs, unrecipedProducts } = ingredientNeedsForOrder(order, recipes, ingredients)

  for (const n of needs) {
    await recordStockMovement({
      ingredientId: n.ingredientId,
      ingredientName: n.ingredientName,
      type: 'production',
      packsDelta: -n.packs,
      orderId: order.id,
      orderNumber: order.orderNumber,
      note: `Production for ${order.orderNumber}`,
    })
  }
  await updateOrder(order.id, { stockDeducted: true })
  return { deducted: needs.length, unrecipedProducts }
}
