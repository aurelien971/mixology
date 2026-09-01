/**
 * The ten classics, straight from the costing sheet.
 *
 * These are the range the deck, the rate card and the Pernod menu obligations
 * all hang off - but several have never existed as products on the platform,
 * which is why they cannot be starred, costed or priced. This is the source
 * used to create the missing ones.
 *
 * Amounts are millilitres per batch, as written on the sheet.
 */

export interface ClassicIngredient {
  name: string
  amountPerBatchMl: number
}

export interface ClassicRecipe {
  name: string
  batchMl: number
  ingredients: ClassicIngredient[]
}

export const CLASSIC_RECIPES: ClassicRecipe[] = [
  {
    name: "Margarita",
    batchMl: 1000,
    ingredients: [
      { name: "Omleca Altos Plata", amountPerBatchMl: 290 },
      { name: "Cointreau", amountPerBatchMl: 90 },
      { name: "Lime juice NFC", amountPerBatchMl: 148 },
      { name: "Acid mix", amountPerBatchMl: 75 },
      { name: "Sugar Syrup", amountPerBatchMl: 25 },
      { name: "Agave syrup", amountPerBatchMl: 15 },
      { name: "Water", amountPerBatchMl: 355 },
      { name: "Lime Flavour treat clear primo", amountPerBatchMl: 2 },
    ],
  },
  {
    name: "G+T",
    batchMl: 1000,
    ingredients: [
      { name: "Beefeater London Dry", amountPerBatchMl: 250 },
      { name: "Orange peel keynote krn-11381", amountPerBatchMl: 0.185 },
      { name: "king of bitters keynote", amountPerBatchMl: 0.555 },
      { name: "Tonic H/M", amountPerBatchMl: 749.26 },
    ],
  },
  {
    name: "Dirty Martini",
    batchMl: 1000,
    ingredients: [
      { name: "Absolut Vodka", amountPerBatchMl: 635 },
      { name: "Martini Dry Vermouth", amountPerBatchMl: 105 },
      { name: "Champagne Vinegar", amountPerBatchMl: 28 },
      { name: "Olive brine", amountPerBatchMl: 85 },
      { name: "water", amountPerBatchMl: 145.6 },
      { name: "Black pepper tincture", amountPerBatchMl: 1.4 },
    ],
  },
  {
    name: "Old Fashioned",
    batchMl: 1000,
    ingredients: [
      { name: "Buffalo Trace", amountPerBatchMl: 430 },
      { name: "Rittenhouse", amountPerBatchMl: 258 },
      { name: "Light brown sugar 66brix", amountPerBatchMl: 50 },
      { name: "Angostura kerry", amountPerBatchMl: 1.72 },
      { name: "salt solution 10%", amountPerBatchMl: 0.5 },
      { name: "Water", amountPerBatchMl: 259.78 },
    ],
  },
  {
    name: "Cosmopolitan",
    batchMl: 1000,
    ingredients: [
      { name: "Vodka Infused with cranberry tosted", amountPerBatchMl: 320 },
      { name: "Lime Flavour treat clear primo", amountPerBatchMl: 0.325 },
      { name: "Cointreau", amountPerBatchMl: 75 },
      { name: "Cranberry syrup", amountPerBatchMl: 130 },
      { name: "Acid Mix", amountPerBatchMl: 195 },
      { name: "Provance herbs tinc", amountPerBatchMl: 5.675 },
      { name: "Water", amountPerBatchMl: 269 },
      { name: "Salt solution", amountPerBatchMl: 5 },
    ],
  },
  {
    name: "Whiskey Sour",
    batchMl: 970,
    ingredients: [
      { name: "Buffalo trace", amountPerBatchMl: 350 },
      { name: "Sugar syrup", amountPerBatchMl: 155 },
      { name: "Acid mix", amountPerBatchMl: 75 },
      { name: "Lemon Juice NFC", amountPerBatchMl: 135 },
      { name: "Angostura bitters (keynote)", amountPerBatchMl: 0.825 },
      { name: "Salt solution", amountPerBatchMl: 5 },
      { name: "Gum arbic", amountPerBatchMl: 20 },
      { name: "Easy foam", amountPerBatchMl: 6.25 },
      { name: "Lemon inf kerry", amountPerBatchMl: 1.2 },
      { name: "Water", amountPerBatchMl: 221.725 },
    ],
  },
  {
    name: "Spicy Margarita",
    batchMl: 1000,
    ingredients: [
      { name: "Tequilla", amountPerBatchMl: 290 },
      { name: "Cointreau", amountPerBatchMl: 90 },
      { name: "Lime juice NFC", amountPerBatchMl: 148 },
      { name: "Acid mix", amountPerBatchMl: 75 },
      { name: "Sugar Syrup", amountPerBatchMl: 25 },
      { name: "Agave syrup", amountPerBatchMl: 15 },
      { name: "Water", amountPerBatchMl: 350 },
      { name: "Lime Flavour treat clear primo", amountPerBatchMl: 2 },
      { name: "Chilli fussion", amountPerBatchMl: 5 },
    ],
  },
  {
    name: "Dry Martini",
    batchMl: 1000,
    ingredients: [
      { name: "Tanqueray Ten", amountPerBatchMl: 690 },
      { name: "Dolin Dry Vermouth", amountPerBatchMl: 130 },
      { name: "Orange peel keynote krn-11381", amountPerBatchMl: 0.434 },
      { name: "Water", amountPerBatchMl: 177.831 },
      { name: "Salt solution", amountPerBatchMl: 1.735 },
    ],
  },
  {
    name: "Negroni",
    batchMl: 1000,
    ingredients: [
      { name: "Beefeater London Dry", amountPerBatchMl: 270 },
      { name: "Campari", amountPerBatchMl: 250 },
      { name: "Cinzano Rosso", amountPerBatchMl: 140 },
      { name: "Punt e mes", amountPerBatchMl: 140 },
      { name: "Cynar", amountPerBatchMl: 30 },
      { name: "water", amountPerBatchMl: 170 },
    ],
  },
  {
    name: "Manhattan",
    batchMl: 1000,
    ingredients: [
      { name: "Buffalo Trace", amountPerBatchMl: 450 },
      { name: "Rittenhouse", amountPerBatchMl: 150 },
      { name: "Cinzanno rosso", amountPerBatchMl: 172 },
      { name: "Peychauds", amountPerBatchMl: 10 },
      { name: "Angostura kerry", amountPerBatchMl: 1.72 },
      { name: "Punt e mes", amountPerBatchMl: 40 },
      { name: "water", amountPerBatchMl: 176.28 },
    ],
  },
  {
    name: "Espresso Martini",
    batchMl: 1096,
    ingredients: [
      { name: "Absolut Vodka", amountPerBatchMl: 245 },
      { name: "Mas rum", amountPerBatchMl: 160 },
      { name: "Kahlua", amountPerBatchMl: 160 },
      { name: "Cacao tincture", amountPerBatchMl: 5 },
      { name: "Gum arbic", amountPerBatchMl: 20 },
      { name: "Water", amountPerBatchMl: 445 },
      { name: "Coffee coarse ground", amountPerBatchMl: 61 },
    ],
  },
]

/** Loose match, so "Spicy Margarita TMS" and "Spicy Margarita FL" read as one drink. */
export function classicKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(tms|fl|foodlab|ltd)\b/g, ' ')
    .replace(/[^a-z+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
