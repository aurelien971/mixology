import { DrinkSpec, MenuOverlap } from '@/types'

/**
 * Spring Street Bar's menu and bar specs as they arrived, used once to put the
 * venue into onboarding. Data only.
 */

export const SSB_ACCOUNT_ID = 'PIIT2reotGZ91p3n5Gg7'
export const SSB_TRIAL = '2026-09-28'

export interface MenuSeed {
  slug: string
  order: number
  name: string
  menuPrice: number
  theirCost: number
  overlap: MenuOverlap
  classicName?: string
  spec?: DrinkSpec
  feedback?: string
}

// From Tom's "SSB Bar Specs" sheet, read on 14 Sep. Names changed between the
// sheet and the menu, so each is attached by hand to the drink it became.
const SPEC: Record<string, DrinkSpec> = {
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

export const SSB_MENU_SEED: MenuSeed[] = [
  { slug: 'aperol-spritz',          order: 1,  name: 'Aperol Spritz',             theirCost: 1.63, menuPrice: 12.00, overlap: 'none' },
  { slug: 'venetian-spritz',        order: 2,  name: 'Venetian Spritz',           theirCost: 1.89, menuPrice: 12.00, overlap: 'none' },
  { slug: 'negroni-house',          order: 3,  name: 'Negroni - House',           theirCost: 0.73, menuPrice: 10.00, overlap: 'same',  classicName: 'Negroni' },
  { slug: 'dirty-martini-mini',     order: 4,  name: 'Dirty Martini (mini 60ml)', theirCost: 1.13, menuPrice: 7.50,  overlap: 'same',  classicName: 'Dirty Martini', spec: SPEC.dirtyMartini },
  { slug: 'spicy-margarita-110',    order: 5,  name: 'Spicy Margarita 110ml',     theirCost: 2.29, menuPrice: 12.00, overlap: 'same',  classicName: 'Spicy Margarita' },
  { slug: 'apricot-bellini',        order: 6,  name: 'Apricot Bellini',           theirCost: 1.18, menuPrice: 14.00, overlap: 'none', spec: SPEC.bellini },
  { slug: 'crystal-coffee-negroni', order: 7,  name: 'Crystal Coffee Negroni',    theirCost: 1.58, menuPrice: 14.00, overlap: 'twist', classicName: 'Negroni', spec: SPEC.coffeeNegroni, feedback: 'YES / change name — renamed from White Coffee Negroni' },
  { slug: 'dirty-cosmopolitan',     order: 8,  name: 'Dirty Cosmopolitan',        theirCost: 1.28, menuPrice: 14.00, overlap: 'twist', classicName: 'Cosmopolitan' },
  { slug: 'espresso-martini',       order: 9,  name: 'Espresso Martini',          theirCost: 1.99, menuPrice: 12.00, overlap: 'same',  classicName: 'Espresso Martini' },
  { slug: 'grapefruit-rosita',      order: 10, name: 'Grapefruit Rosita',         theirCost: 2.69, menuPrice: 14.00, overlap: 'none', spec: SPEC.rosita },
  { slug: 'heart-breaker',          order: 11, name: 'Heart Breaker',             theirCost: 2.87, menuPrice: 14.00, overlap: 'none', spec: SPEC.heartBreaker },
  { slug: 'la-tua-margarita',       order: 12, name: 'La Tua Margarita',          theirCost: 2.57, menuPrice: 14.00, overlap: 'twist', classicName: 'Margarita' },
  { slug: 'lower-east-side',        order: 13, name: 'Lower East Side',           theirCost: 1.75, menuPrice: 14.00, overlap: 'none', spec: SPEC.lowerEastSide, feedback: 'YES' },
  { slug: 'manhattan',              order: 14, name: 'Manhattan',                 theirCost: 2.30, menuPrice: 14.00, overlap: 'same',  classicName: 'Manhattan' },
  { slug: 'm-m-hiball',             order: 15, name: 'M&M Hiball',                theirCost: 1.61, menuPrice: 14.00, overlap: 'none', spec: SPEC.hiball, feedback: 'YES / but move to a low ball' },
  { slug: 'naked-famous',           order: 16, name: 'Naked & Famous',            theirCost: 2.11, menuPrice: 14.00, overlap: 'none' },
  { slug: 'negroni',                order: 17, name: 'Negroni',                   theirCost: 1.46, menuPrice: 10.00, overlap: 'same',  classicName: 'Negroni' },
  { slug: 'ny-sour',                order: 18, name: 'NY Sour',                   theirCost: 2.34, menuPrice: 14.00, overlap: 'none', spec: SPEC.nySour, feedback: 'YES' },
  { slug: 'old-fashioned',          order: 19, name: 'Old Fashioned',             theirCost: 1.91, menuPrice: 14.00, overlap: 'same',  classicName: 'Old Fashioned' },
  { slug: 'rum-punch',              order: 20, name: 'Rum Punch',                 theirCost: 1.32, menuPrice: 12.00, overlap: 'none' },
  { slug: 'spicy-mezcal-marg',      order: 21, name: 'Spicy Mezcal Marg',         theirCost: 2.20, menuPrice: 14.00, overlap: 'twist', classicName: 'Spicy Margarita', spec: SPEC.mezcal },
  { slug: 'yuzu-bergamot-daiquiri', order: 22, name: 'Yuzu Bergamot Daiquiri',    theirCost: 1.97, menuPrice: 14.00, overlap: 'none', spec: SPEC.daiquiri, feedback: 'Good / more yuzu needed' },
]

/** On Tom's spec sheet but not on the menu — kept so nobody wonders where they went. */
export const SSB_NOT_ON_MENU = 'Tomatini and Olive Negroni were on the spec sheet but not the menu (Olive Negroni feedback: "Good / needs something citrus?").'
