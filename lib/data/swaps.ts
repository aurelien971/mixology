/**
 * The spirit swaps, from the Pernod Ricard UK contract (pages 3–4), Chris Howe's
 * mandate of 20 Aug 2026, and LWC trade pricing.
 *
 * Three kinds, and the distinction is the whole point:
 *
 *  - `mandated`  the contract names the product. We move, and the retro counts
 *                toward Lowline's group volumes.
 *  - `refuse`    on the confirmed list, and still the wrong call — it costs more
 *                than the retro returns.
 *  - `taste`     nothing to do with Pernod. A cheaper line inside the LWC list,
 *                so it is a quality decision rather than a sourcing one.
 *
 * Bottle counts are Foodlab's own LWC orders, June to August 2026.
 */

export type SwapVerdict = 'mandated' | 'refuse' | 'taste'

export interface Swap {
  verdict: SwapVerdict
  from: string            // the ingredient as it is named in our library
  fromPrice: number       // £ per bottle, LWC list
  to: string
  toPrice: number
  bottles: number         // Jun–Aug 2026
  retroPerBottle: number  // £ cash retro, PRUK schedule
  note: string
}

export const SWAPS: Swap[] = [
  {
    verdict: 'mandated',
    from: 'Ojo de Tigre Mezcal', fromPrice: 29.25,
    to: 'Del Maguey Puebla', toPrice: 27.25,
    bottles: 102, retroPerBottle: 0.78,
    note: 'Chris named this one directly. Cheaper as well as compliant — the only swap on the list that is both. '
        + 'Careful: he wrote "Vida Puebla", but Del Maguey Vida is £34.92. The contract names Puebla.',
  },
  {
    verdict: 'mandated',
    from: 'Tanqueray Ten', fromPrice: 36.24,
    to: 'Beefeater London Dry', toPrice: 13.67,
    bottles: 3, retroPerBottle: 0.39,
    note: 'Small on bottles, enormous on the Dry Martini — 690ml of every litre. Beefeater is the mandated house gin '
        + 'and 45% cheaper per litre. The Negroni already uses it.',
  },
  {
    verdict: 'mandated',
    from: 'Planteray Rum Original Dark', fromPrice: 20.98,
    to: 'Havana Club 7YO', toPrice: 19.86,
    bottles: 19, retroPerBottle: 1.17,
    note: 'Bumbu is also on the confirmed list but costs £28.37 — Havana Club 7YO is the right pick of the two.',
  },
  {
    verdict: 'mandated',
    from: 'Appleton Estate Signature Rum', fromPrice: 19.98,
    to: 'Havana Club 3YO', toPrice: 15.76,
    bottles: 5, retroPerBottle: 0.93,
    note: 'Havana Club 3YO is also the mandated base for Daiquiri and Mojito under the menu obligations.',
  },
  {
    verdict: 'mandated',
    from: 'Ojo de Dios / Verde Amaras Mezcal', fromPrice: 29.96,
    to: 'Del Maguey Puebla', toPrice: 27.25,
    bottles: 3, retroPerBottle: 0.78,
    note: 'The tail of the mezcal line. Same swap as the main one.',
  },
  {
    verdict: 'refuse',
    from: 'Buffalo Trace Bourbon', fromPrice: 18.39,
    to: 'Jameson Irish Whiskey', toPrice: 17.62,
    bottles: 12, retroPerBottle: 0.62,
    note: 'On the list and technically a swap, but it turns an Old Fashioned into a different drink for £17 a quarter. '
        + 'A tasting call for Mark, not a sourcing one.',
  },
  {
    verdict: 'refuse',
    from: 'House Jules Clairon Brandy', fromPrice: 12.52,
    to: 'Martell Cognac', toPrice: 24.66,
    bottles: 16, retroPerBottle: 0.54,
    note: 'On the confirmed list and still wrong: £194 of extra cost to collect £9 of retro. Say no, and say why.',
  },
  {
    verdict: 'taste',
    from: 'Cointreau', fromPrice: 18.87,
    to: 'Soho Triple Sec', toPrice: 10.02,
    bottles: 42, retroPerBottle: 0,
    note: 'Rémy, so nothing to do with Pernod and no retro either way. The single biggest saving available — and the '
        + 'one that decides whether the Margarita clears the 80% ceiling. Monin at £8.86 and Iseo at £6.28 save more still.',
  },
  {
    verdict: 'taste',
    from: 'Rittenhouse Rye', fromPrice: 31.99,
    to: 'Sazerac Straight Rye', toPrice: 25.84,
    bottles: 0, retroPerBottle: 0,
    note: '19% off the second most expensive line in the Old Fashioned and the Manhattan. Not enough on its own to '
        + 'bring either inside £16, but it narrows the gap before the ruling.',
  },
]

export interface SwapTotals {
  costSaving: number
  retro: number
  total: number
  bottles: number
}

export function swapTotals(swaps: Swap[]): SwapTotals {
  let costSaving = 0
  let retro = 0
  let bottles = 0
  for (const s of swaps) {
    costSaving += (s.fromPrice - s.toPrice) * s.bottles
    retro += s.retroPerBottle * s.bottles
    bottles += s.bottles
  }
  return {
    costSaving: Math.round(costSaving * 100) / 100,
    retro: Math.round(retro * 100) / 100,
    total: Math.round((costSaving + retro) * 100) / 100,
    bottles,
  }
}

/** Foodlab's total LWC spend for the same window, so savings can be read as a percentage. */
export const QUARTER_SPEND = 12425.72
