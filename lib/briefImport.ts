import {
  Product, RecipeIngredient, TastingItem, ChecklistItem, DevVariant, normalizeDrinkName,
} from '@/types'
import { getProducts, createProduct } from '@/lib/firestore/catalog'
import { createRecipe } from '@/lib/firestore/recipes'
import { createTasting } from '@/lib/firestore/tastings'
import { createProject } from '@/lib/firestore/projects'
import { nextCode } from '@/lib/coreRange'

/**
 * Turning a parsed brief into work on the board.
 *
 * One confirmation creates what the team would otherwise set up by hand across
 * four pages: a product and a draft recipe per drink, a tasting on the date that
 * matters, and a project with a checklist to get to the trial.
 */

export type BriefEventKind = 'trial' | 'tasting' | 'launch' | 'deadline' | 'other'

export interface BriefEvent { date: string; kind: BriefEventKind; label: string }

export interface BriefLine {
  name: string
  amount: number | null
  unit: string
  matchedIngredientId: string | null
}

export interface BriefDrink {
  name: string
  ingredients: BriefLine[]
  serveMl: number | null
  glass: string | null
  garnish: string | null
  method: string | null
  format: 'premix' | 'syrup' | 'unclear'
  notes: string | null
  menuPrice?: number | null     // their menu price inc VAT, when the brief gives it
  costPerServe?: number | null  // their own costing, when the brief gives it
}

export interface ParsedBrief {
  account: { matchedAccountId: string | null; name: string }
  summary: string
  events: BriefEvent[]
  drinks: BriefDrink[]
  pricingRequested: boolean
  nextSteps: string[]
  warnings: string | null
}

// Bar specs are written per serve. Recipes here are per litre of batch, so
// every liquid line becomes its share of the serve. Dashes and barspoons are
// approximations — close enough for a first cost, flagged in the method.
const TO_ML: Record<string, number> = {
  ml: 1, cl: 10, l: 1000, litre: 1000, liter: 1000,
  oz: 29.5735, 'fl oz': 29.5735, floz: 29.5735,
  dash: 0.9, dashes: 0.9, barspoon: 5, barspoons: 5, bsp: 5, tsp: 5, tbsp: 15,
  drop: 0.05, drops: 0.05,
}

const unitKey = (u: string) => u.trim().toLowerCase().replace(/\.$/, '')

export function liquidMl(line: BriefLine): number | null {
  if (line.amount === null) return null
  const f = TO_ML[unitKey(line.unit)]
  return f ? line.amount * f : null
}

export function serveVolume(drink: BriefDrink): number {
  const summed = drink.ingredients.reduce((s, l) => s + (liquidMl(l) ?? 0), 0)
  return summed > 0 ? summed : drink.serveMl ?? 0
}

/** Per-serve spec → per-litre recipe lines. */
export function toRecipeLines(drink: BriefDrink): { lines: RecipeIngredient[]; unconverted: string[] } {
  const total = serveVolume(drink)
  const unconverted: string[] = []
  const lines: RecipeIngredient[] = drink.ingredients.map((l) => {
    const ml = liquidMl(l)
    let qtyPer1L = 0
    let unit = l.unit || 'unit'
    if (total > 0 && ml !== null) {
      qtyPer1L = ml / total                       // litres of this per litre of drink
      unit = 'L'
    } else if (total > 0 && l.amount !== null && unitKey(l.unit) === 'g') {
      qtyPer1L = l.amount / total                 // kg per litre
      unit = 'KG'
    } else if (total > 0 && l.amount !== null) {
      qtyPer1L = (l.amount * 1000) / total        // pieces per litre
      unconverted.push(`${l.name} (${l.amount} ${l.unit})`)
    } else {
      unconverted.push(l.name)
    }
    const row: RecipeIngredient = {
      name: l.name,
      unit,
      qtyPer1L: Math.round(qtyPer1L * 10000) / 10000,
      qtyPer1000L: Math.round(qtyPer1L * 1000 * 100) / 100,
    }
    if (l.matchedIngredientId) row.ingredientId = l.matchedIngredientId
    return row
  })
  return { lines, unconverted }
}

/** The date to put the tasting on: a tasting if one is named, else the trial. */
export function tastingDate(events: BriefEvent[]): BriefEvent | undefined {
  const by = (k: BriefEventKind) => events.filter((e) => e.kind === k).sort((a, b) => a.date.localeCompare(b.date))[0]
  return by('tasting') ?? by('trial') ?? by('launch')
}

export interface ImportChoices {
  drinks: BriefDrink[]
  accountId?: string
  accountName: string
  createRecipes: boolean
  createTasting: boolean
  createProject: boolean
  tastingOn?: string        // YYYY-MM-DD
  owner?: string
  source: string            // file names, for the audit trail
}

export interface ImportResult {
  productsCreated: number
  productsReused: number
  recipesCreated: number
  tastingId?: string
  projectId?: string
}

const dayAt = (d: string) => new Date(d + 'T12:00:00')

export async function importBrief(brief: ParsedBrief, c: ImportChoices): Promise<ImportResult> {
  const result: ImportResult = { productsCreated: 0, productsReused: 0, recipesCreated: 0 }
  const at = new Date().toISOString()

  // Fresh read so product codes cannot collide with anything created meanwhile.
  const catalog = await getProducts()
  let code = nextCode(catalog)
  const items: TastingItem[] = []

  for (const drink of c.drinks) {
    const key = normalizeDrinkName(drink.name)
    const existing = catalog.find((p) => p.isActive !== false && normalizeDrinkName(p.name) === key)
    let productId: string
    const serve = Math.round(serveVolume(drink)) || 100

    if (existing) {
      productId = existing.id
      result.productsReused++
    } else {
      const productCode = `FL-${code++}`
      const servingNotes = [drink.glass, drink.garnish && `garnish: ${drink.garnish}`].filter(Boolean).join(' · ')
      const data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
        productCode,
        baseCode: productCode,
        name: drink.name,
        description: `Bespoke for ${c.accountName}`,
        category: 'Bespoke',
        recommendedServingG: serve,
        volumeLitres: 5,
        costToMake: 0,
        costMissing: true,
        isNonAlcoholic: false,
        isCoreRange: false,
        isClassic: false,
        isActive: true,
      }
      if (servingNotes) data.servingNotes = servingNotes
      productId = await createProduct(data)
      result.productsCreated++
    }

    if (c.createRecipes) {
      const { lines, unconverted } = toRecipeLines(drink)
      const method = [
        drink.method,
        drink.glass && `Glass: ${drink.glass}`,
        drink.garnish && `Garnish: ${drink.garnish}`,
        drink.notes,
        '',
        `DRAFT — converted from the bar spec (${serve}ml per serve) for ${c.accountName}. Dilution is not included.`,
        unconverted.length ? `Not converted, check by hand: ${unconverted.join(', ')}.` : null,
        `Imported from: ${c.source}`,
      ].filter((x): x is string => typeof x === 'string').join('\n')

      await createRecipe({
        name: drink.name,
        variation: c.accountName,
        version: 'draft',
        createdBy: 'Brief import',
        dateCreated: at.slice(0, 10),
        productId,
        productName: drink.name,
        ingredients: lines,
        analyticalValues: [],
        cookingInstructions: method,
        status: 'active',
      })
      result.recipesCreated++
    }

    const variant: DevVariant = drink.format === 'syrup' ? 'syrup' : 'premix'
    items.push({
      productId,
      productName: drink.name,
      variant,
      pricePerLitre: 0,           // pricing is the next job, not a guess
      servingMl: serve,
      verdict: 'pending',
    })
  }

  const events = brief.events
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `${e.label} — ${e.date}`)

  if (c.createTasting && items.length) {
    result.tastingId = await createTasting({
      accountId: c.accountId,
      accountName: c.accountName,
      isProspect: !c.accountId,
      stage: c.tastingOn ? 'booked' : 'requested',
      scheduledAt: c.tastingOn ? dayAt(c.tastingOn) : undefined,
      owner: c.owner,
      items,
      nextStep: brief.pricingRequested ? 'Price every drink' : brief.nextSteps[0],
      notes: [brief.summary, events.length ? `Dates: ${events.join(' · ')}` : null].filter(Boolean).join('\n'),
      updates: [{ at, text: `Created from a brief (${c.source})`, kind: 'auto' }],
    })
  }

  if (c.createProject) {
    const trial = brief.events.find((e) => e.kind === 'trial') ?? tastingDate(brief.events)
    const check = (text: string, due?: string): ChecklistItem => {
      const item: ChecklistItem = { id: Math.random().toString(36).slice(2, 10), text, done: false }
      if (due) item.due = due
      if (c.owner) item.owner = c.owner
      return item
    }
    const checklist: ChecklistItem[] = [
      ...c.drinks.map((d) => check(`Spec and cost ${d.name}`)),
      ...(brief.pricingRequested ? [check('Send pricing')] : []),
      ...brief.nextSteps.map((s) => check(s)),
      ...brief.events.map((e) => check(e.label, e.date)),
    ]
    result.projectId = await createProject({
      title: `${c.accountName} — bespoke drinks`,
      kind: 'rd',
      category: 'cocktails',
      location: 'uk',
      accountName: c.accountName,
      stage: 'development',
      owner: c.owner,
      dueDate: trial ? dayAt(trial.date) : undefined,
      nextStep: brief.pricingRequested ? 'Price every drink' : brief.nextSteps[0],
      scope: brief.summary,
      checklist,
      notes: events.length ? `Dates: ${events.join(' · ')}` : undefined,
      updates: [{ at, text: `Created from a brief (${c.source})`, kind: 'auto' }],
    })
  }

  return result
}
