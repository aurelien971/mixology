import { SsbDrink, SsbSpec, SsbStage } from '@/types'

/**
 * Spring Street Bar's bespoke menu: the drinks, the specs Tom sent, and the
 * rules for pricing and moving a drink along. Data only — no Firestore here.
 */

export const SSB_ACCOUNT_NAME = 'Spring Street Bar'
export const SSB_DEFAULT_TRIAL = '2026-09-28'
/** The margin a venue expects on a cocktail. */
export const VENUE_GP_TARGET = 80

export type SsbSeed = Pick<SsbDrink, 'id' | 'name' | 'category' | 'order' | 'sheetCost' | 'sheetSale' | 'overlap' | 'classicName' | 'spec' | 'feedback'>

// From Tom's "SSB Bar Specs" sheet, read on 14 Sep. Names changed between the
// sheet and the menu, so each is attached by hand to the drink it became.
const SPEC: Record<string, SsbSpec> = {
  mezcal: {
    fromName: 'Spicey Mezcal Marg', serveMl: 100, glass: 'Rocks', garnish: 'Tajin rim',
    method: 'Shake and strain all ingredients, pour over fresh cubed ice in a chilled glass',
    notes: "Sheet sub-heading 'Tropic like its hot'. 'Anco blend' unidentified — possibly Ancho Reyes, confirm with Tom. Nduja fat wash is in-house prep on Del Maguey Puebla.",
    ingredients: [
      { name: 'Nduja fat-washed Del Maguey Puebla', amount: 40, unit: 'ml' },
      { name: 'Anco blend', amount: 10, unit: 'ml' },
      { name: 'Fresh lime', amount: 20, unit: 'ml' },
      { name: 'Pineapple juice', amount: 25, unit: 'ml' },
      { name: 'Agave', amount: 5, unit: 'ml' },
    ],
  },
  coffeeNegroni: {
    fromName: 'White Coffee Negroni', serveMl: 80, glass: 'Rocks', garnish: 'White chocolate shard',
    method: 'Stir all ingredients in a mixing glass and strain over fresh ice in a chilled rocks glass',
    notes: "Renamed on the menu — feedback on the sheet was 'change name' (sub-heading 'Crystal coffee'). Coffee oil wash is in-house prep on Beefeater.",
    ingredients: [
      { name: 'Coffee oil-washed Beefeater Dry Gin', amount: 30, unit: 'ml' },
      { name: 'Luxardo Bitter Bianco', amount: 25, unit: 'ml' },
      { name: 'Dolin Blanc vermouth', amount: 25, unit: 'ml' },
    ],
  },
  nySour: {
    fromName: 'NY Sour / Penicillin', serveMl: 115, glass: 'Rocks', garnish: 'Ginger candy & grated lime zest',
    method: 'Shake all ingredients except the amaro and strain over cubed ice. Drizzle in the amaro and microplane lime zest over the top',
    notes: 'Amaro is a drizzle, not in the shake — which amaro is not specified.',
    ingredients: [
      { name: 'Bulleit Rye', amount: 50, unit: 'ml' },
      { name: 'Fresh lemon juice', amount: 20, unit: 'ml' },
      { name: 'Honey & ginger syrup', amount: 15, unit: 'ml' },
      { name: 'Egg white', amount: 20, unit: 'ml' },
      { name: 'Amaro', amount: 10, unit: 'ml' },
    ],
  },
  lowerEastSide: {
    fromName: 'Lower East Side', serveMl: 72.5, glass: 'Coupe', garnish: 'Cucumber spiral',
    method: 'Shake and fine strain all ingredients into a chilled coupe',
    notes: 'Maraschino written as 5–10ml (7.5ml used). Mint as leaves or syrup, no quantity. Gin brand not specified.',
    ingredients: [
      { name: 'Gin', amount: 25, unit: 'ml' },
      { name: 'Fresh lime', amount: 20, unit: 'ml' },
      { name: 'Cucumber juice', amount: 20, unit: 'ml' },
      { name: 'Maraschino', amount: 7.5, unit: 'ml' },
      { name: 'Mint leaves / mint syrup', amount: null, unit: 'to taste' },
    ],
  },
  rosita: {
    fromName: 'Grapefruit Rosita', serveMl: 75, glass: 'Rocks', garnish: 'Grapefruit slice, lemon discard',
    method: 'Stir all ingredients in a mixing glass and strain over fresh ice in a chilled rocks glass. Heavy lemon zest express, garnish with a grapefruit slice',
    notes: "Sheet sub-heading 'agrumes/bitter'. Tequila brand not specified.",
    ingredients: [
      { name: 'Tequila', amount: 35, unit: 'ml' },
      { name: 'Campari', amount: 20, unit: 'ml' },
      { name: 'Pamplemousse (Pampelle)', amount: 20, unit: 'ml' },
    ],
  },
  hiball: {
    fromName: 'M&M Hiball', serveMl: 45, glass: 'Hi-ball', garnish: 'Orange slice, straw',
    method: 'Ice the hi-ball, pour our 45ml batch into the glass, top with soda and churn slightly',
    notes: 'We supply the 45ml batch; the soda is topped at the bar.',
    ingredients: [
      { name: 'Campari', amount: 15, unit: 'ml' },
      { name: 'Sweet vermouth', amount: 15, unit: 'ml' },
      { name: 'Desi Daru mango vodka', amount: 15, unit: 'ml' },
      { name: 'Mandarin soda', amount: null, unit: 'top' },
    ],
  },
  heartBreaker: {
    fromName: 'Heart Breaker', serveMl: 65, glass: 'Hi-ball', garnish: 'Lemon / cherry sail, straw',
    method: 'Build in the glass, top with soda, churn slightly and garnish with the lemon/cherry sail',
    notes: 'Rye is a choice of Rittenhouse, Knob Creek or Bulleit. Soda topped at the bar. Sweet vermouth brand not specified.',
    ingredients: [
      { name: 'Rye — Rittenhouse / Knob Creek / Bulleit', amount: 40, unit: 'ml' },
      { name: 'Sweet vermouth', amount: 25, unit: 'ml' },
      { name: 'Cherry soda', amount: null, unit: 'top' },
    ],
  },
  bellini: {
    fromName: 'AP Bellini', serveMl: 90, glass: 'Levitas flute', garnish: null,
    method: "Build the first ingredients in a tin (never measure the prosecco), stir, and pour into the glass while pouring the prosecco",
    notes: "Prosecco is free-poured at the bar, so we would supply the peach and apricot base. 50ml or 75ml prosecco to confirm. 'Apricot' not specified as purée or liqueur.",
    ingredients: [
      { name: 'White peach purée', amount: 25, unit: 'ml' },
      { name: 'Apricot', amount: 15, unit: 'ml' },
      { name: 'Prosecco (50 or 75ml)', amount: 50, unit: 'ml' },
    ],
  },
  daiquiri: {
    fromName: 'Yuzu & bergamot daiquiri', serveMl: 90, glass: 'Coupe', garnish: null,
    method: 'Shake and strain all ingredients into a chilled coupe',
    notes: null,
    ingredients: [
      { name: 'Havana Club 3', amount: 40, unit: 'ml' },
      { name: 'Yuzu curaçao', amount: 15, unit: 'ml' },
      { name: 'Bergamot liqueur', amount: 15, unit: 'ml' },
      { name: 'Lime juice', amount: 20, unit: 'ml' },
    ],
  },
  dirtyMartini: {
    fromName: 'Dirty / Olive oil Martini', serveMl: 95, glass: 'Nick & Nora', garnish: 'Olive for gin, olive pick for vodka',
    method: 'Freezer door, poured to the wash line (~85ml)',
    notes: "The spec sheet version is a 95ml freezer-door pour; the menu lists a 60ml mini — confirm which. '20l brine' on the sheet read as 20ml. Vodka or gin build to confirm.",
    ingredients: [
      { name: 'Vodka / gin', amount: 50, unit: 'ml' },
      { name: 'Manguin vodka / gin', amount: 10, unit: 'ml' },
      { name: 'Noilly Prat', amount: 15, unit: 'ml' },
      { name: 'Olive brine', amount: 20, unit: 'ml' },
    ],
  },
}

export const SSB_SEED: SsbSeed[] = [
  { id: 'aperol-spritz',          order: 1,  name: 'Aperol Spritz',             category: 'Cocktail', sheetCost: 1.63, sheetSale: 12.00, overlap: 'none' },
  { id: 'venetian-spritz',        order: 2,  name: 'Venetian Spritz',           category: 'Cocktail', sheetCost: 1.89, sheetSale: 12.00, overlap: 'none' },
  { id: 'negroni-house',          order: 3,  name: 'Negroni - House',           category: 'Cocktail', sheetCost: 0.73, sheetSale: 10.00, overlap: 'same',  classicName: 'Negroni' },
  { id: 'dirty-martini-mini',     order: 4,  name: 'Dirty Martini (mini 60ml)', category: 'Cocktail', sheetCost: 1.13, sheetSale: 7.50,  overlap: 'same',  classicName: 'Dirty Martini', spec: SPEC.dirtyMartini },
  { id: 'spicy-margarita-110',    order: 5,  name: 'Spicy Margarita 110ml',     category: 'Cocktail', sheetCost: 2.29, sheetSale: 12.00, overlap: 'same',  classicName: 'Spicy Margarita' },
  { id: 'apricot-bellini',        order: 6,  name: 'Apricot Bellini',           category: 'Cocktail', sheetCost: 1.18, sheetSale: 14.00, overlap: 'none', spec: SPEC.bellini },
  { id: 'crystal-coffee-negroni', order: 7,  name: 'Crystal Coffee Negroni',    category: 'Cocktail', sheetCost: 1.58, sheetSale: 14.00, overlap: 'twist', classicName: 'Negroni', spec: SPEC.coffeeNegroni, feedback: 'YES / change name — renamed from White Coffee Negroni' },
  { id: 'dirty-cosmopolitan',     order: 8,  name: 'Dirty Cosmopolitan',        category: 'Cocktail', sheetCost: 1.28, sheetSale: 14.00, overlap: 'twist', classicName: 'Cosmopolitan' },
  { id: 'espresso-martini',       order: 9,  name: 'Espresso Martini',          category: 'Cocktail', sheetCost: 1.99, sheetSale: 12.00, overlap: 'same',  classicName: 'Espresso Martini' },
  { id: 'grapefruit-rosita',      order: 10, name: 'Grapefruit Rosita',         category: 'Cocktail', sheetCost: 2.69, sheetSale: 14.00, overlap: 'none', spec: SPEC.rosita },
  { id: 'heart-breaker',          order: 11, name: 'Heart Breaker',             category: 'Cocktail', sheetCost: 2.87, sheetSale: 14.00, overlap: 'none', spec: SPEC.heartBreaker },
  { id: 'la-tua-margarita',       order: 12, name: 'La Tua Margarita',          category: 'Cocktail', sheetCost: 2.57, sheetSale: 14.00, overlap: 'twist', classicName: 'Margarita' },
  { id: 'lower-east-side',        order: 13, name: 'Lower East Side',           category: 'Cocktail', sheetCost: 1.75, sheetSale: 14.00, overlap: 'none', spec: SPEC.lowerEastSide, feedback: 'YES' },
  { id: 'manhattan',              order: 14, name: 'Manhattan',                 category: 'Cocktail', sheetCost: 2.30, sheetSale: 14.00, overlap: 'same',  classicName: 'Manhattan' },
  { id: 'm-m-hiball',             order: 15, name: 'M&M Hiball',                category: 'Cocktail', sheetCost: 1.61, sheetSale: 14.00, overlap: 'none', spec: SPEC.hiball, feedback: 'YES / but move to a low ball' },
  { id: 'naked-famous',           order: 16, name: 'Naked & Famous',            category: 'Cocktail', sheetCost: 2.11, sheetSale: 14.00, overlap: 'none' },
  { id: 'negroni',                order: 17, name: 'Negroni',                   category: 'Cocktail', sheetCost: 1.46, sheetSale: 10.00, overlap: 'same',  classicName: 'Negroni' },
  { id: 'ny-sour',                order: 18, name: 'NY Sour',                   category: 'Cocktail', sheetCost: 2.34, sheetSale: 14.00, overlap: 'none', spec: SPEC.nySour, feedback: 'YES' },
  { id: 'old-fashioned',          order: 19, name: 'Old Fashioned',             category: 'Cocktail', sheetCost: 1.91, sheetSale: 14.00, overlap: 'same',  classicName: 'Old Fashioned' },
  { id: 'rum-punch',              order: 20, name: 'Rum Punch',                 category: 'Cocktail', sheetCost: 1.32, sheetSale: 12.00, overlap: 'none' },
  { id: 'spicy-mezcal-marg',      order: 21, name: 'Spicy Mezcal Marg',         category: 'Cocktail', sheetCost: 2.20, sheetSale: 14.00, overlap: 'twist', classicName: 'Spicy Margarita', spec: SPEC.mezcal },
  { id: 'yuzu-bergamot-daiquiri', order: 22, name: 'Yuzu Bergamot Daiquiri',    category: 'Cocktail', sheetCost: 1.97, sheetSale: 14.00, overlap: 'none', spec: SPEC.daiquiri, feedback: 'Good / more yuzu needed' },
]

/** On Tom's spec sheet but not on the menu — kept so nobody wonders where they went. */
export const SSB_NOT_ON_MENU = [
  { name: 'Tomatini', note: "Freezer-door gin, 'la tomato', Noilly and water. No feedback on the sheet." },
  { name: 'Olive Negroni', note: "Olive oil gin, Campari, sweet vermouth. Feedback was 'Good / needs something citrus?'" },
]

export const OVERLAP_LABEL: Record<SsbDrink['overlap'], { label: string; bg: string; fg: string }> = {
  same:  { label: 'Our classic', bg: '#dcfce7', fg: '#166534' },
  twist: { label: 'Twist on ours', bg: '#dbeafe', fg: '#1d4ed8' },
  none:  { label: 'Bespoke', bg: '#f3f4f6', fg: '#4b5563' },
}

/** The menu sheet's own maths: net of 20% VAT, margin, venue GP. */
export function priceMaths(cost: number, sale: number) {
  const net = sale / 1.2
  const margin = net - cost
  const gp = net > 0 ? (margin / net) * 100 : 0
  return { net, margin, gp }
}

export function gpColor(gp: number): string {
  return gp >= VENUE_GP_TARGET ? '#166534' : gp >= 75 ? '#b45309' : '#b91c1c'
}

/** Where "Done" takes a drink. Changes asked goes back to tasting. */
export const SSB_NEXT: Partial<Record<SsbStage, SsbStage>> = {
  to_review: 'in_development',
  in_development: 'tasting',
  tasting: 'approved',
  changes: 'tasting',
  approved: 'signed_off',
}

/** The road as drawn: changes asked sits on the tasting step. */
export const SSB_ROAD: SsbStage[] = ['to_review', 'in_development', 'tasting', 'approved', 'signed_off']
export const roadIndex = (s: SsbStage) => SSB_ROAD.indexOf(s === 'changes' ? 'tasting' : s)

/** Serve size from the spec, or from the name when it says ("110ml", "mini 60ml"). */
export function serveOf(d: Pick<SsbDrink, 'name' | 'spec'>): number | null {
  const m = d.name.match(/(\d+)\s?ml/i)
  if (m) return Number(m[1])
  return d.spec?.serveMl ?? null
}
