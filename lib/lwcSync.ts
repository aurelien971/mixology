import lwcPrices from '@/lib/data/lwcPrices.json'
import { Ingredient } from '@/types'
import { retroFor, RetroLine } from '@/lib/data/pernodRetro'

// LWC's own trade list. Prices are list — the 2% Pernod rebate is NOT included,
// confirmed with Jambo, so it gets applied here rather than assumed.
export const LWC_REBATE = 0.02

export interface LwcLine {
  code: string
  name: string
  price: number          // £ per pack, as listed
  litres: number | null  // pack size, parsed from the description
}

export const LWC_LINES = lwcPrices as LwcLine[]

// "ABSOLUT VODKA 70CL" → "absolut vodka". Sizes, pack counts and punctuation are
// noise when matching a trade description to a recipe ingredient name.
function key(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b\d+\s*x\s*\d+(\.\d+)?\s*(cl|ml|ltr|l)\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(cl|ml|ltr|l)\b/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'the', 'and', 'original', 'orig', 'premium', 'house', 'classic',
  'liqueur', 'liq', 'syrup', 'bottle', 'btl', 'gin', 'rum', 'vodka',
  'whisky', 'whiskey', 'tequila', 'tequilla', 'mezcal', 'wine', 'juice',
])

function tokens(s: string): string[] {
  return key(s).split(' ').filter((t) => t.length > 2)
}

export interface LwcMatch {
  line: LwcLine
  confidence: number      // 0–1
  pricePerLitre: number   // list price ÷ pack litres
}

// Score a candidate on how much of the ingredient's name it accounts for.
// Distinctive words (Beefeater, Cointreau) count for more than category words
// (gin, rum) — otherwise every rum on the list matches every rum ingredient.
function score(ingredientName: string, line: LwcLine): number {
  const a = tokens(ingredientName)
  const b = tokens(line.name)
  if (!a.length || !b.length) return 0
  let hit = 0
  let weight = 0
  for (const t of a) {
    const w = STOPWORDS.has(t) ? 0.25 : 1
    weight += w
    if (b.some((x) => x === t || (t.length > 4 && x.startsWith(t.slice(0, 5))))) hit += w
  }
  if (!weight) return 0
  const coverage = hit / weight
  // A short trade name that is fully accounted for is a better match than a long
  // one that happens to contain the same words.
  const brevity = 1 - Math.min(0.3, Math.abs(b.length - a.length) * 0.06)
  return coverage * brevity
}

export function matchLwc(ingredientName: string): LwcMatch | null {
  let best: LwcMatch | null = null
  for (const line of LWC_LINES) {
    if (!line.litres || line.litres <= 0) continue
    const s = score(ingredientName, line)
    if (s < 0.6) continue
    if (!best || s > best.confidence) {
      best = { line, confidence: s, pricePerLitre: line.price / line.litres }
    }
  }
  return best
}

export interface PriceProposal {
  ingredient: Ingredient
  match: LwcMatch | null
  /** what packPrice would become, in the ingredient's own pack size */
  newPackPrice: number | null
  delta: number | null          // £ change on the pack
  deltaPct: number | null
  /** Contract retro on this line, when Pernod covers it. */
  retro: RetroLine | null
}

/**
 * Work out what each ingredient's pack price becomes on LWC pricing.
 * Only ingredients measured in litres can be re-priced from a bottle list —
 * anything sold by weight or by unit is left alone.
 */
export function proposePrices(
  ingredients: Ingredient[],
  applyRebate: boolean,
  applyRetro = false
): PriceProposal[] {
  return ingredients.map((ingredient) => {
    const retro = retroFor(ingredient.name)
    const none = { ingredient, match: null, newPackPrice: null, delta: null, deltaPct: null, retro }
    if (ingredient.isProcess || ingredient.packUnit !== 'L') return none

    const match = matchLwc(ingredient.name)
    if (!match || !ingredient.packSize) return { ...none, match: null }

    // The retro is per bottle as the contract lists it, so it comes off the
    // line at the pack the trade list quotes, then scales with our pack size.
    const bottleLitres = match.line.litres || 0.7
    const retroPerLitre = retro && bottleLitres > 0 ? retro.perBottle / bottleLitres : 0

    let perLitre = match.pricePerLitre * (applyRebate ? 1 - LWC_REBATE : 1)
    if (applyRetro) perLitre = Math.max(0, perLitre - retroPerLitre)

    const newPackPrice = Math.round(perLitre * ingredient.packSize * 100) / 100
    const delta = Math.round((newPackPrice - ingredient.packPrice) * 100) / 100
    return {
      ingredient,
      match,
      newPackPrice,
      delta,
      deltaPct: ingredient.packPrice > 0 ? (delta / ingredient.packPrice) * 100 : null,
      retro,
    }
  })
}
