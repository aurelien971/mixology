import { format } from 'date-fns'
import {
  Product, Recipe, Ingredient, MenuDrink, MenuOverlap, MenuStage, RolloutVenue,
  CORE_RANGE, MENU_STAGES, classicKeys, normalizeDrinkName, matchesClassic,
} from '@/types'
import { splitRecipeCost } from '@/lib/pricing'
import type { BriefDrink } from '@/lib/briefImport'
import { primaryRecipe } from '@/lib/liveCost'

/**
 * The rules of onboarding a venue's menu, in one place so the board, the venue
 * page and every section agree on what "ready" means.
 */

export const DEFAULT_GP_TARGET = 80
export const DEFAULT_MARGIN_FLOOR = 30

export const OVERLAP_LABEL: Record<MenuOverlap, { label: string; short: string; bg: string; fg: string }> = {
  same:  { label: 'Our classic',      short: 'Ours',  bg: '#dcfce7', fg: '#166534' },
  twist: { label: 'Twist on ours',    short: 'Twist', bg: '#dbeafe', fg: '#1d4ed8' },
  none:  { label: 'New — we make it', short: 'New',   bg: '#f3e8ff', fg: '#7e22ce' },
}

export const stageInfo = (s: MenuStage) => MENU_STAGES.find((x) => x.value === s) ?? MENU_STAGES[0]

/** The road a drink travels. Changes asked sits on the tasting step. */
export const MENU_ROAD: MenuStage[] = ['to_review', 'in_development', 'tasting', 'approved', 'signed_off']
export const menuRoadIndex = (s: MenuStage) => MENU_ROAD.indexOf(s === 'changes' ? 'tasting' : s)
export const MENU_NEXT: Partial<Record<MenuStage, MenuStage>> = {
  to_review: 'in_development',
  in_development: 'tasting',
  tasting: 'approved',
  changes: 'tasting',
  approved: 'signed_off',
}

const stripForMatch = (name: string) =>
  name.replace(/\(.*?\)/g, ' ').replace(/\b\d+\s?ml\b/gi, ' ').replace(/[-–]\s*house\b/gi, ' ').replace(/\bno spirit\b/gi, ' ')

/** Is a drink on their menu one of ours, a twist on one, or new to us? */
export function detectOverlap(name: string): { overlap: MenuOverlap; classicName?: string } {
  const key = normalizeDrinkName(stripForMatch(name))
  const same = CORE_RANGE.find((c) => classicKeys(c).includes(key))
  if (same) return { overlap: 'same', classicName: same.name }
  const twist = matchesClassic(name)
  return twist ? { overlap: 'twist', classicName: twist } : { overlap: 'none' }
}

export function serveOf(d: Pick<MenuDrink, 'name' | 'serveMl' | 'spec'>): number | null {
  if (d.serveMl) return d.serveMl
  const m = d.name.match(/(\d+)\s?ml/i)
  if (m) return Number(m[1])
  return d.spec?.serveMl ?? null
}

export function classicProduct(name: string | undefined, products: Product[]): Product | undefined {
  if (!name) return undefined
  return products.find((p) => p.isClassic && p.isActive !== false && (matchesClassic(p.name) ?? p.name) === name)
}

export type RecipeNeed = 'ready' | 'write' | 'adapt' | 'classic_missing'
export type GpVerdict = 'pass' | 'set_price' | 'fails' | 'impossible' | 'unknown'

export const RECIPE_NEED: Record<RecipeNeed, { label: string; bg: string; fg: string }> = {
  ready:           { label: '✓ Recipe',          bg: '#dcfce7', fg: '#166534' },
  write:           { label: 'Write from spec',   bg: '#f3e8ff', fg: '#7e22ce' },
  adapt:           { label: 'Adapt our recipe',  bg: '#dbeafe', fg: '#1d4ed8' },
  classic_missing: { label: 'Our recipe missing', bg: '#fee2e2', fg: '#991b1b' },
}

export const GP_VERDICT: Record<GpVerdict, { label: string; bg: string; fg: string }> = {
  pass:       { label: '✓ Guaranteed',    bg: '#dcfce7', fg: '#166534' },
  set_price:  { label: 'Set our price',   bg: '#dbeafe', fg: '#1d4ed8' },
  fails:      { label: 'Price misses',    bg: '#fef3c7', fg: '#92400e' },
  impossible: { label: "Can't reach it",  bg: '#fee2e2', fg: '#991b1b' },
  unknown:    { label: 'Missing info',    bg: '#f3f4f6', fg: '#4b5563' },
}

export interface GpCheck {
  verdict: GpVerdict
  reason: string
  net?: number             // menu price without VAT
  maxPrice?: number        // the most we can charge per serve and they keep the target
  minPrice?: number        // the least we can charge and keep our floor
  suggested?: number
  venueGp?: number         // with our current price
  ourGp?: number
  menuPriceNeeded?: number // when it cannot work at their menu price
}

const r2 = (n: number) => Math.round(n * 100) / 100
const down5 = (n: number) => Math.floor(n * 20) / 20

/**
 * Can we guarantee the venue its GP on this drink, and still make ours?
 * Their GP is on the menu price net of VAT, against what the serve costs them:
 * our price, plus their own spirit when it is the no-spirit format.
 */
export function gpCheck(d: MenuDrink, venue: RolloutVenue, costPerServe: number | null): GpCheck {
  const target = venue.gpTarget ?? DEFAULT_GP_TARGET
  const floor = venue.marginFloor ?? DEFAULT_MARGIN_FLOOR
  if (!d.menuPrice) return { verdict: 'unknown', reason: 'No menu price yet' }
  const net = d.menuPrice / 1.2
  const spirit = d.format === 'syrup' ? d.spiritCost ?? 0 : 0
  const maxPrice = net * (1 - target / 100) - spirit
  const out: GpCheck = { verdict: 'unknown', reason: '', net, maxPrice }
  if (d.ourPrice) {
    out.venueGp = ((net - d.ourPrice - spirit) / net) * 100
    if (costPerServe !== null) out.ourGp = ((d.ourPrice - costPerServe) / d.ourPrice) * 100
  }
  if (costPerServe === null) {
    out.reason = `No cost yet — to keep ${target}% we can charge up to £${Math.max(0, maxPrice).toFixed(2)} a serve`
    return out
  }
  const minPrice = costPerServe / (1 - floor / 100)
  out.minPrice = minPrice
  if (minPrice > maxPrice) {
    out.verdict = 'impossible'
    out.menuPriceNeeded = r2(((minPrice + spirit) / (1 - target / 100)) * 1.2)
    out.reason = `It costs us too much for a £${d.menuPrice.toFixed(2)} menu price — it would need to be £${out.menuPriceNeeded.toFixed(2)}`
    return out
  }
  out.suggested = Math.max(r2(minPrice), down5(maxPrice))
  if (!d.ourPrice) {
    out.verdict = 'set_price'
    out.reason = `Charge between £${minPrice.toFixed(2)} and £${maxPrice.toFixed(2)} a serve`
    return out
  }
  const venueOk = (out.venueGp ?? 0) >= target - 0.05
  const oursOk = (out.ourGp ?? 0) >= floor - 0.05
  if (venueOk && oursOk) {
    out.verdict = 'pass'
    out.reason = `${out.venueGp!.toFixed(1)}% for them, ${out.ourGp!.toFixed(1)}% for us`
    return out
  }
  out.verdict = 'fails'
  out.reason = !venueOk
    ? `Leaves them ${out.venueGp!.toFixed(1)}% — charge £${maxPrice.toFixed(2)} or less`
    : `Leaves us ${out.ourGp!.toFixed(1)}% — charge £${minPrice.toFixed(2)} or more`
  return out
}

export interface DrinkState {
  own?: Product            // the product this drink is made as
  recipe?: Recipe          // its own recipe (or our classic's, when it is ours)
  recipeNeed: RecipeNeed
  costPerLitre: number | null
  costPerServe: number | null
  costIsEstimate: boolean  // a twist costed from our classic until its own recipe exists
  serve: number | null
  gp: GpCheck
}

export function drinkState(d: MenuDrink, venue: RolloutVenue, products: Product[], recipes: Recipe[], ingredients: Ingredient[]): DrinkState {
  const classic = classicProduct(d.classicName, products)
  // A recipe linked by hand wins over anything worked out from names.
  const linked = d.recipeId ? recipes.find((r) => r.id === d.recipeId) : undefined
  const ownId = linked?.productId ?? d.productId
  const ownProduct = ownId ? products.find((p) => p.id === ownId) : undefined
  const own = linked
    ? ownProduct
    : d.overlap === 'same' ? ownProduct ?? classic : ownProduct && ownProduct.id !== classic?.id ? ownProduct : undefined
  const recipe = linked ?? (own ? primaryRecipe(own, recipes) : undefined)
  const classicRecipe = classic ? primaryRecipe(classic, recipes) : undefined
  const recipeNeed: RecipeNeed = recipe ? 'ready' : d.overlap === 'same' ? 'classic_missing' : d.overlap === 'twist' ? 'adapt' : 'write'
  const basis = recipe ?? (d.overlap === 'twist' ? classicRecipe : undefined)
  let costPerLitre: number | null = null
  if (basis) {
    const split = splitRecipeCost(basis, ingredients)
    costPerLitre = d.format === 'syrup' ? split.mixerPerLitre || null : split.complete ? split.totalPerLitre : null
  }
  const serve = serveOf(d) ?? (own?.recommendedServingG || null)
  const costPerServe = costPerLitre !== null && serve ? (costPerLitre * serve) / 1000 : null
  return { own, recipe, recipeNeed, costPerLitre, costPerServe, costIsEstimate: !recipe && !!basis, serve, gp: gpCheck(d.menuPrice ? d : { ...d, menuPrice: own?.defaultRsp }, venue, costPerServe) }
}

export interface ReadinessCheck { key: string; label: string; done: boolean; detail: string; goto: 'menu' | 'gp' | 'recipes' | 'tastings' }

export interface Readiness {
  active: number
  signed: number
  pct: number
  recipesMissing: number
  gpPass: number
  confirmed: number
  checks: ReadinessCheck[]
  allGood: boolean
}

/** Is the venue ready: menu in, a date, recipes, 80% guaranteed, priced, signed off. */
export function readiness(venue: RolloutVenue, drinks: MenuDrink[], states: Map<string, DrinkState>): Readiness {
  const target = venue.gpTarget ?? DEFAULT_GP_TARGET
  const active = drinks.filter((d) => d.stage !== 'dropped')
  const n = active.length
  const signed = active.filter((d) => d.stage === 'signed_off').length
  const recipesMissing = active.filter((d) => states.get(d.id)?.recipeNeed !== 'ready').length
  const gpPass = active.filter((d) => states.get(d.id)?.gp.verdict === 'pass').length
  const confirmed = active.filter((d) => d.priceConfirmed).length
  const checks: ReadinessCheck[] = [
    { key: 'menu', label: 'Their menu is in', done: n > 0, detail: n ? `${n} drinks` : 'Drop their brief or add drinks', goto: 'menu' },
    { key: 'date', label: 'Tasting date set', done: !!venue.tastingDate, detail: venue.tastingDate ? format(new Date(venue.tastingDate + 'T12:00:00'), 'EEE d MMM') : 'No date yet', goto: 'tastings' },
    { key: 'recipes', label: 'Every drink has a recipe', done: n > 0 && recipesMissing === 0, detail: recipesMissing ? `${recipesMissing} missing` : 'All written', goto: 'recipes' },
    { key: 'gp', label: `Every drink guarantees them ${target}% GP`, done: n > 0 && gpPass === n, detail: `${gpPass} of ${n}`, goto: 'gp' },
    { key: 'prices', label: 'Every price confirmed', done: n > 0 && confirmed === n, detail: `${confirmed} of ${n}`, goto: 'gp' },
    { key: 'signed', label: 'Every drink tasted and signed off', done: n > 0 && signed === n, detail: `${signed} of ${n}`, goto: 'menu' },
  ]
  return {
    active: n, signed, pct: n ? Math.round((signed / n) * 100) : 0,
    recipesMissing, gpPass, confirmed, checks, allGood: checks.every((c) => c.done),
  }
}

/** Their spec in the shape the per-litre converter reads, for a recipe draft. */
export function specAsBriefDrink(d: MenuDrink): BriefDrink | null {
  if (!d.spec) return null
  return {
    name: d.name,
    ingredients: d.spec.ingredients.map((l) => ({ name: l.name, amount: l.amount, unit: l.unit, matchedIngredientId: null })),
    serveMl: d.spec.serveMl,
    glass: d.spec.glass,
    garnish: d.spec.garnish,
    method: d.spec.method,
    format: d.format === 'syrup' ? 'syrup' : 'premix',
    notes: d.spec.notes,
  }
}
