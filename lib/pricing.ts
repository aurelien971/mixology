import { Ingredient, Recipe } from '@/types'
import { matchIngredient } from '@/lib/costing'

/**
 * Pricing for the two formats we sell.
 *
 * Pre-mix: we supply the finished drink, spirit included, and the venue pays us
 * once. Syrup: the venue pours its own spirit and we supply everything else —
 * so the spirit leaves our cost base *and* our invoice, but it still lands on
 * the venue's GP. That is the whole reason the two models price differently,
 * and why a target GP that works on one can be impossible on the other.
 */

// Names that mean "the venue buys this". Brands first, then categories, so
// "Havana Club" is caught even though "club" means nothing on its own.
const ALCOHOL_TERMS = [
  'vodka', 'gin', 'rum', 'tequila', 'mezcal', 'whisky', 'whiskey', 'bourbon', 'rye',
  'cognac', 'brandy', 'armagnac', 'liqueur', 'liquer', 'vermouth', 'sherry', 'port',
  'wine', 'champagne', 'prosecco', 'cava', 'sake', 'absinthe', 'amaro', 'aperitivo',
  'schnapps', 'triple sec', 'curacao', 'creme de',
  'absolut', 'beefeater', 'tanqueray', 'altos', 'olmeca', 'havana', 'bacardi',
  'appleton', 'planteray', 'plantation', 'wray', 'bumbu', 'malibu', 'kahlua',
  'cointreau', 'campari', 'aperol', 'cinzano', 'martini', 'punt e mes', 'cynar',
  'lillet', 'st germain', 'st-germain', 'chartreuse', 'jameson', 'buffalo trace',
  'rittenhouse', 'sazerac', 'laphroaig', 'del maguey', 'ojo de', 'verde amaras',
  'martell', 'italicus', 'sarti', 'briottet', 'giffard', 'xante', 'melonade',
  'peychaud', 'angostura', 'soho', 'iseo', 'clairon', 'dolin', 'croft', 'botivo',
]

/** Best guess at whether a recipe line is the spirit, before anyone overrides it. */
export function looksAlcoholic(name: string): boolean {
  const n = name.toLowerCase()
  // Syrups and juices borrow brand names — Giffard and Monin make both.
  if (/\b(syrup|sirop|juice|nfc|puree|cordial|tincture|solution|water|foam|acid|sugar|salt|gum)\b/.test(n)) {
    return false
  }
  return ALCOHOL_TERMS.some((t) => n.includes(t))
}

export function isAlcoholicIngredient(ing: Ingredient | undefined, fallbackName: string): boolean {
  if (ing?.isAlcoholic !== undefined) return ing.isAlcoholic
  return looksAlcoholic(ing?.name ?? fallbackName)
}

export interface CostSplit {
  /** £ per litre of finished batch */
  spiritPerLitre: number
  mixerPerLitre: number
  totalPerLitre: number
  spiritLines: string[]
  mixerLines: string[]
  complete: boolean
}

export function splitRecipeCost(recipe: Recipe, ingredients: Ingredient[]): CostSplit {
  let spirit = 0
  let mixer = 0
  const spiritLines: string[] = []
  const mixerLines: string[] = []
  let complete = true

  for (const row of recipe.ingredients) {
    const ing = matchIngredient(row, ingredients)
    if (!ing || !(ing.pricePerUnit > 0)) { complete = false; continue }
    const cost = row.qtyPer1L * ing.pricePerUnit
    if (isAlcoholicIngredient(ing, row.name)) { spirit += cost; spiritLines.push(ing.name) }
    else { mixer += cost; mixerLines.push(ing.name) }
  }

  const r = (n: number) => Math.round(n * 10000) / 10000
  return {
    spiritPerLitre: r(spirit),
    mixerPerLitre: r(mixer),
    totalPerLitre: r(spirit + mixer),
    spiritLines, mixerLines, complete,
  }
}

export interface PricingInputs {
  menuPrice: number        // £ inc VAT on the venue's menu
  vatRate: number          // 0.20
  venueGpTarget: number    // 0.80
  ourGpTarget: number      // the margin we will not go below
  servingMl: number
  mode: PriceMode
}

/** Whose margin gets protected when both targets cannot hold at once. */
export type PriceMode = 'venue' | 'ours' | 'split'

export interface FormatResult {
  /** What we can charge the venue per serve and still leave them their target GP. */
  ourPrice: number
  /** What that serve costs us to make. */
  ourCost: number
  ourGpPercent: number
  /** The floor: the least we can charge and still hit our own GP target. */
  ourFloor: number
  /** False when the floor is above the ceiling — the targets cannot both hold. */
  works: boolean
  /** Menu price at which both targets hold. */
  menuPriceNeeded: number
  /** The GP the venue is actually left with at `ourPrice`. */
  venueGpPercent: number
  /** The most we could charge before the venue drops below its target. */
  ourCeiling: number
}

export interface DrinkPricing {
  netPerServe: number
  spiritPerServe: number
  premix: FormatResult
  syrup: FormatResult
}

function round(n: number) { return Math.round(n * 100) / 100 }

export function priceDrink(split: CostSplit, i: PricingInputs): DrinkPricing {
  const net = i.menuPrice / (1 + i.vatRate)
  const per = i.servingMl / 1000
  const spirit = split.spiritPerLitre * per
  const mixer = split.mixerPerLitre * per
  const total = split.totalPerLitre * per

  // What the venue can spend in total and still hold its GP.
  const venueBudget = net * (1 - i.venueGpTarget)

  const format = (ourCost: number, ceiling: number, theirSpirit: number): FormatResult => {
    // Ceiling: the most we can charge before the venue drops below its target.
    // Floor: the least we can charge and still clear ours. When the floor is
    // above the ceiling the two targets are incompatible at this menu price,
    // and `mode` decides which one gives.
    const floor = i.ourGpTarget < 1 ? ourCost / (1 - i.ourGpTarget) : Infinity
    const works = ceiling >= floor

    const price =
      i.mode === 'venue' ? ceiling
      : i.mode === 'ours' ? floor
      : works ? (ceiling + floor) / 2 : (ceiling + floor) / 2

    const safe = Math.max(0, price)
    const ourGp = safe > 0 ? ((safe - ourCost) / safe) * 100 : 0
    // Whatever we charge, the venue also pays for its own spirit on the syrup.
    const venueGp = net > 0 ? ((net - safe - theirSpirit) / net) * 100 : 0

    return {
      ourPrice: round(safe),
      ourCost: round(ourCost),
      ourGpPercent: Math.round(ourGp * 10) / 10,
      ourFloor: round(floor),
      ourCeiling: round(Math.max(0, ceiling)),
      venueGpPercent: Math.round(venueGp * 10) / 10,
      works,
      menuPriceNeeded: 0,   // filled below
    }
  }

  // Pre-mix: we supply everything, so the venue's whole budget comes to us.
  const premix = format(total, venueBudget, 0)
  // Syrup: the venue buys its own spirit out of the same budget first.
  const syrup = format(mixer, venueBudget - spirit, spirit)

  // The menu price at which both our floor and their target hold.
  const needed = (ourCost: number, theirSpirit: number) => {
    const floor = i.ourGpTarget < 1 ? ourCost / (1 - i.ourGpTarget) : Infinity
    const netNeeded = (floor + theirSpirit) / (1 - i.venueGpTarget)
    return round(netNeeded * (1 + i.vatRate))
  }
  premix.menuPriceNeeded = needed(total, 0)
  syrup.menuPriceNeeded = needed(mixer, spirit)

  return {
    netPerServe: round(net),
    spiritPerServe: round(spirit),
    premix,
    syrup,
  }
}
