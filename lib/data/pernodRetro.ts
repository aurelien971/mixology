/**
 * Cash retro per bottle, from the Pernod Ricard UK contract, page 3.
 *
 * This money is earned on the bottles we buy but never appears on an LWC
 * invoice — it is paid centrally and quarterly. So it belongs in a costing
 * decision and not in an invoice reconciliation, which is why it is a toggle
 * rather than baked into the price.
 */

export interface RetroLine {
  /** As written in the contract. Matched loosely against ingredient names. */
  product: string
  perBottle: number
  role: string
}

export const PERNOD_RETRO: RetroLine[] = [
  { product: 'Absolut Vodka',              perBottle: 1.00, role: 'House Pour Vodka' },
  { product: 'Altos Olmeca Plata',         perBottle: 3.50, role: 'House Pour Tequila' },
  { product: 'Beefeater Standard',         perBottle: 0.39, role: 'House Pour Gin' },
  { product: 'Beefeater Pink',             perBottle: 0.39, role: 'House Pour Flavoured Gin' },
  { product: 'Jameson Original',           perBottle: 0.62, role: 'House Pour Irish Whiskey' },
  { product: 'Havana Club 3 Years Old',    perBottle: 0.93, role: 'House Pour White Rum' },
  { product: 'Kahlua',                     perBottle: 0.47, role: 'House Pour Coffee Liqueur' },
  { product: 'Malibu Original',            perBottle: 0.39, role: 'House Pour Coconut Rum' },
  { product: 'Del Maguey Puebla',          perBottle: 0.78, role: 'House Pour Mezcal' },
  { product: 'Absolut Raspberri',          perBottle: 0.54, role: 'Premium Pour Flavoured Vodka' },
  { product: 'Absolut Vanilia',            perBottle: 0.54, role: 'Premium Pour Flavoured Vodka' },
  { product: 'Bumbu The Original',         perBottle: 0.93, role: 'Premium Pour Dark Rum' },
  { product: 'Havana Club 7 Years Old',    perBottle: 1.17, role: 'Premium Pour Dark Rum' },
  { product: 'Perrier-Jouet Grand Brut',   perBottle: 5.00, role: 'Premium Pour Champagne' },
  { product: 'Lillet Rose',                perBottle: 0.67, role: 'Premium Pour Wine-Based Aperitif' },
  { product: 'Italicus Rosolio',           perBottle: 0.47, role: 'Premium Pour Bergamot Liqueur' },
  { product: 'Martell VS',                 perBottle: 0.54, role: 'Premium Pour Cognac' },
  { product: 'Perrier Jouet Blason Rose',  perBottle: 5.42, role: 'Premium Pour Rosé Champagne' },
  { product: 'Jameson Ginger & Lime 33cl', perBottle: 0.18, role: 'Must Stock' },
  { product: 'Jameson Black Barrel',       perBottle: 0.93, role: 'Must Stock' },
  { product: 'Malibu Pina Colada 25cl',    perBottle: 0.14, role: 'Must Stock' },
]

function key(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Retro per bottle for an ingredient, or null when the contract does not cover it. */
export function retroFor(ingredientName: string): RetroLine | null {
  const n = key(ingredientName)
  if (!n) return null
  let best: RetroLine | null = null
  let bestScore = 0
  for (const line of PERNOD_RETRO) {
    const words = key(line.product).split(' ').filter((w) => w.length > 2)
    if (!words.length) continue
    const hits = words.filter((w) => n.includes(w)).length
    // Needs most of the contract name present, so "Absolut Vodka" does not
    // collect the retro meant for "Absolut Vanilia".
    const score = hits / words.length
    if (score >= 0.6 && score > bestScore) { best = line; bestScore = score }
  }
  return best
}
