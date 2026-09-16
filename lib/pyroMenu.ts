import { MenuOverlap, MenuStage } from '@/types'

/**
 * Pyro's autumn/winter menu brief from Nico (Nicolas Brulin), September 2026,
 * as it arrived. Used once to put the brief into onboarding. Data only.
 */

export const PYRO_ACCOUNT_ID = 'XVxSZXeylkYTai1x1X11'

export interface PyroSeed {
  slug: string
  order: number
  name: string
  overlap: MenuOverlap
  classicName?: string
  stage: MenuStage
  feedback?: string       // Nico's words on it
  nextStep?: string
  productName?: string    // an existing product it already is
  log: string
}

export const PYRO_BRIEF = {
  summary:
    'Nico and Yiannis are building the autumn/winter menu, launching mid-October. Staying: Aegina, Lychee Martini, Greek Coffee, Pyro Colada and the Spicy Margarita (try it without mezcal). ' +
    'Taps: Apple Penicillin replaces Peach & Scotch; Rhubarb & Vanilla and Beetroot & Lemongrass are new; Melon & Verbena, Thyme & Pomegranate and Mountain Iced Tea come off. ' +
    'Signatures: new versions of Tzatziki, Midas, Aegeas, Chloris, Daphne and the Clear Bloody Mary, and a festive Old Fashioned replacing the Smoked Artichoke Margarita. ' +
    'Also asked for: a bay leaf, kombu & black peppercorn distillate for their Aegean G+T.',
  receivedAt: '2026-09-16',
  source: 'Email from Nicolas Brulin — autumn/winter menu',
  warnings: 'No menu prices yet, and no tasting date — they want to start tasting soon for a mid-October launch.',
}

export const PYRO_MENU_SEED: PyroSeed[] = [
  // Staying on the menu
  { slug: 'aegina',          order: 1,  name: 'Aegina',          overlap: 'none', stage: 'signed_off', productName: 'Aegina',          feedback: 'Staying on the menu', log: 'Staying on the autumn/winter menu' },
  { slug: 'lychee-martini',  order: 2,  name: 'Lychee Martini',  overlap: 'none', stage: 'signed_off', productName: 'Lychee Martini',  feedback: 'Staying on the menu', log: 'Staying on the autumn/winter menu' },
  { slug: 'greek-coffee',    order: 3,  name: 'Greek Coffee',    overlap: 'none', stage: 'signed_off', productName: 'Greek Coffee',    feedback: 'Staying on the menu', log: 'Staying on the autumn/winter menu' },
  { slug: 'pyro-colada',     order: 4,  name: 'Pyro Colada',     overlap: 'none', stage: 'signed_off', productName: 'Pyro Colada',     feedback: 'Staying on the menu', log: 'Staying on the autumn/winter menu' },
  { slug: 'spicy-margarita', order: 5,  name: 'Spicy Margarita', overlap: 'same', classicName: 'Spicy Margarita', stage: 'in_development',
    feedback: 'Staying — would it be possible to try a version without mezcal?', nextStep: 'Make a version without mezcal to taste', log: 'Staying on the menu; they asked for a version without mezcal' },

  // Taps
  { slug: 'apple-penicillin-tap',      order: 6, name: 'Apple Penicillin (tap)',      overlap: 'none', stage: 'to_review',
    feedback: 'Replaces Peach & Scotch — an apple / penicillin version', nextStep: 'Develop an apple penicillin for the tap', log: 'New tap cocktail, replacing Peach & Scotch' },
  { slug: 'rhubarb-vanilla-tap',       order: 7, name: 'Rhubarb & Vanilla (tap)',     overlap: 'none', stage: 'to_review',
    feedback: 'Their flavour idea for the taps — happy for our input', nextStep: 'Develop and cost', log: 'New tap flavour they worked out' },
  { slug: 'beetroot-lemongrass-tap',   order: 8, name: 'Beetroot & Lemongrass (tap)', overlap: 'none', stage: 'to_review',
    feedback: 'Their flavour idea for the taps — happy for our input', nextStep: 'Develop and cost', log: 'New tap flavour they worked out' },

  // Signature cocktails — new seasonal versions
  { slug: 'tzatziki-saffron-pumpkin',  order: 9,  name: 'Tzatziki — saffron & pumpkin',     overlap: 'none', stage: 'to_review',
    feedback: 'Saffron & pumpkin with orange blossom foam', nextStep: 'Develop the new Tzatziki', log: 'New seasonal version of Tzatziki' },
  { slug: 'midas-pear',                order: 10, name: 'Midas — pear',                     overlap: 'none', stage: 'to_review',
    feedback: 'Seasonal Midas with pear instead of apricot', nextStep: 'Swap apricot for pear and taste', log: 'New seasonal version of Midas' },
  { slug: 'aegeas-pine-needle',        order: 11, name: 'Aegeas — pine needle Martini',     overlap: 'twist', classicName: 'Dry Martini', stage: 'to_review',
    feedback: 'A pine needle version of a Martini', nextStep: 'Develop from our Dry Martini', log: 'New version of Aegeas — pine needle Martini' },
  { slug: 'chloris-rose-pomegranate',  order: 12, name: 'Chloris — rose & pomegranate',     overlap: 'none', stage: 'to_review',
    feedback: 'Rose & pomegranate', nextStep: 'Develop and cost', log: 'New signature: Chloris' },
  { slug: 'daphne-hazelnut-truffle',   order: 13, name: 'Daphne — hazelnut & truffle Negroni', overlap: 'twist', classicName: 'Negroni', stage: 'to_review',
    feedback: 'A Negroni twist with hazelnut & truffle', nextStep: 'Develop from our Negroni', log: 'New signature: Daphne' },
  { slug: 'clear-bloody-mary-carrot',  order: 14, name: 'Clear Bloody Mary — carrot & caraway', overlap: 'twist', classicName: 'Bloody Mary', stage: 'to_review',
    feedback: 'A carrot & caraway version of the clear Bloody Mary', nextStep: 'Develop the carrot & caraway version', log: 'New seasonal version of the Clear Bloody Mary' },
  { slug: 'festive-old-fashioned',     order: 15, name: 'Festive Old Fashioned — cherry & cocoa', overlap: 'twist', classicName: 'Old Fashioned', stage: 'to_review',
    feedback: 'Replaces the Smoked Artichoke Margarita — a cherry and cocoa festive Old Fashioned', nextStep: 'Develop from our Old Fashioned', log: 'New festive Old Fashioned, replacing the Smoked Artichoke Margarita' },

  // Special request
  { slug: 'aegean-gt-distillate',      order: 16, name: 'Aegean G+T — bay leaf, kombu & black pepper distillate', overlap: 'twist', classicName: 'G&T', stage: 'to_review',
    feedback: 'Could we create a distillate for their Aegean G+T: bay leaf / kombu & black peppercorn', nextStep: 'Develop the distillate', log: 'Request: a distillate for their Aegean G+T' },

  // Coming off the menu — kept so the history of the menu is complete
  { slug: 'peach-scotch-tap',          order: 17, name: 'Peach & Scotch (tap)',            overlap: 'none', stage: 'dropped', productName: 'Peach & Scotch Soda', feedback: 'Replaced by the Apple Penicillin', log: 'Coming off the menu — replaced by an apple penicillin' },
  { slug: 'melon-verbena-tap',         order: 18, name: 'Melon & Verbena (tap)',           overlap: 'none', stage: 'dropped', productName: 'Melon & Lemon Verbena', feedback: 'Out of the menu', log: 'Coming off the menu' },
  { slug: 'thyme-pomegranate-tap',     order: 19, name: 'Thyme & Pomegranate (tap)',       overlap: 'none', stage: 'dropped', productName: 'Thyme & Pomegranate', feedback: 'Out of the menu', log: 'Coming off the menu' },
  { slug: 'mountain-iced-tea-tap',     order: 20, name: 'Mountain Iced Tea (tap)',         overlap: 'none', stage: 'dropped', productName: 'Mountain Ice Tea', feedback: 'Out of the menu', log: 'Coming off the menu' },
  { slug: 'smoked-artichoke-margarita', order: 21, name: 'Smoked Artichoke Margarita',     overlap: 'none', stage: 'dropped', productName: 'Smoked Artichoke Spicy Margarita', feedback: 'Replaced by a festive Old Fashioned', log: 'Coming off the menu — replaced by the festive Old Fashioned' },
]
