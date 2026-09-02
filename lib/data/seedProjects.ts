import { Project } from '@/types'

/**
 * Work that arrived by email rather than through the platform.
 *
 * These are added to the board automatically the first time it loads, matched
 * on title so it can never duplicate them. Owners, dates and scores stay blank
 * on purpose — those are the ranking conversation, not something to invent.
 */
export type ProjectSeed = Omit<Project, 'id' | 'createdAt' | 'updatedAt'> & { checklistText?: string[] }

export const SEED_PROJECTS: ProjectSeed[] = [
  // ── The just-add-alcohol range ────────────────────────────────────────────
  {
    title: 'Just-add-alcohol range — ten classics as syrups',
    kind: 'range',
    category: 'cocktails',
    stage: 'development',
    accountName: 'Foodlab',
    scope:
      'The ten classics rebuilt as syrups: we supply everything but the spirit, the venue pours its own. ' +
      'Needs its own costing and price — the syrup carries no alcohol, so it never competes with a venue’s ' +
      'supplier deal or its retro, which is the structural edge the pre-mix will never have. ' +
      'Launch-ready inside 30 days, ruling end of September with a finished product in hand.',
    nextStep: 'Cost the syrup versions of the ten classics',
    checklistText: [
      'Cost each classic as a syrup, without the spirit',
      'Set a price per litre and a price per serve',
      'Agree the pack format and size',
      'Group tasting — ten org leads',
      'Syrup ruling with a finished product in hand',
    ],
  },

  // ── Bloomin ───────────────────────────────────────────────────────────────
  { title: 'Custard Syrup',                   kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin' },
  { title: 'White choc sauce',                kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin' },
  { title: 'Jabuticaba syrup / Lucuma Syrup', kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin',
    scope: 'Two syrups briefed together. Split into separate projects if they diverge on timing or spec.' },
  { title: 'Recovery blend',                  kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin' },
  { title: 'Tangerine syrup',                 kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin' },
  { title: "S'mores + Sticky Toffee",         kind: 'rd', category: 'bloomin', stage: 'development', accountName: 'Bloomin',
    dueDate: new Date('2026-09-11T12:00:00'), nextStep: 'Finish up R&D', scope: 'R&D finishing 11 September.' },
  { title: 'Crackle Cup R&D',                 kind: 'rd', category: 'bloomin', stage: 'development', accountName: 'Bloomin' },
  { title: 'Madeline / SS / Blondie',         kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin',
    scope: 'Three briefed together. Split if they diverge on timing or spec.' },
  { title: 'Date Spread',                     kind: 'rd', category: 'bloomin', stage: 'brief',       accountName: 'Bloomin' },

  // ── Flat Iron ─────────────────────────────────────────────────────────────
  {
    title: 'Flat Iron trial — syrup vs finished cocktail',
    kind: 'rd',
    category: 'cocktails',
    stage: 'development',
    accountName: 'Flat Iron Square',
    scope:
      'Margarita, side by side at FIS: our finished pre-batch against a syrup version where the bar pours its own ' +
      'tequila. Chris is open to it, Dima builds both. Flat Iron Square house-pours Altos Plata and there is a live ' +
      'Altos activation this summer, so the trial already sits inside the Pernod contract.',
    nextStep: "Agree a date with Chris's team",
    checklistText: [
      "Agree the date with Chris's team",
      'Dima builds the finished Margarita',
      'Dima builds the syrup version',
      'Confirm the bar pours Altos Plata',
      'Agree how the two are judged, and by whom',
      'Run the trial',
      'Write the verdict up for Mark',
    ],
  },
]
