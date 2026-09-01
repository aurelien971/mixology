export type AccountType = 'internal' | 'external'

export type OrderStatus =
  | 'received'
  | 'production'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'disputed'

export type BusinessLine = 'cocktail' | 'baek'

export type BaekFlavour = 'intricate' | 'mellow' | 'variety'

export const BAEK_PRICE_PER_CASE = 210
export const BAEK_BOTTLES_PER_CASE = 6

export type PaymentTerms = 'net_14' | 'net_30' | 'net_60' | 'upfront' | 'split_50'
  | 'net_14'
  | 'net_30'
  | 'net_60'
  | 'upfront'
  | 'split_50'

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  net_14: 'Net 14 days',
  net_30: 'Net 30 days',
  net_60: 'Net 60 days',
  upfront: 'Upfront (100%)',
  split_50: '50% upfront / 50% on delivery',
}

export const PAYMENT_TERMS_DAYS: Record<PaymentTerms, number> = {
  net_14: 14,
  net_30: 30,
  net_60: 60,
  upfront: 0,
  split_50: 30,
}

export interface Group {
  id: string
  name: string
  type: 'managed' | 'standalone'
  contactEmail?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Account {
  id: string
  legalName: string
  tradingName: string
  type: AccountType
  groupId?: string
  groupName?: string
  email: string
  phone?: string
  address: {
    line1: string
    line2?: string
    city: string
    postcode: string
  }
  billingEmail?: string
  vatNumber?: string
  paymentTerms: PaymentTerms
  notes?: string
  clientToken?: string
  businessLine?: BusinessLine    // 'cocktail' (default) | 'baek'
  createdAt: Date
  updatedAt: Date
}

export interface Product {
  id: string
  productCode: string
  name: string
  description?: string
  category?: string
  servingNotes?: string
  costToMake: number            // Foodlab production cost — internal only, per serving
  costMissing: boolean          // true when cost data is not yet known
  recommendedServingG: number
  volumeLitres: number          // bag/bottle size: 5, 10, or 19
  baseCode: string              // groups variants of the same recipe e.g. "FL-100001"
  isNonAlcoholic: boolean
  isCoreRange: boolean          // available to any external client
  isClassic?: boolean           // one of the ten classics — the range we cost, price and pitch on
  defaultPricePerLitre?: number // standard sell price/L for core range
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AccountPricing {
  id: string
  accountId: string
  accountName: string
  groupId?: string
  groupName?: string
  productId: string
  productCode: string
  productName: string
  volumeLitres: number          // 5, 10, or 19
  recommendedServingG: number
  pricePerUnit: number          // = pricePerLitre × volumeLitres
  pricePerLitre: number
  rrp: number
  venueGpPercent: number
  foodlabGpPercent: number      // internal — never shown in client PDFs
  createdAt: Date
  updatedAt: Date
}

export interface OrderLineItem {
  productId: string
  productCode: string
  productName: string
  volumeLitres: number          // bag/bottle size: 5, 10, or 19
  quantity: number              // number of bags/bottles
  unitPrice: number             // price per bag = pricePerLitre × volumeLitres
  lineTotal: number
  servingSizeG: number
}

export interface RecipeIngredient {
  name: string
  supplier?: string
  code?: string
  unit: string
  qtyPer1000L: number
  qtyPer1L: number
  ingredientId?: string         // link into the ingredients library — used for costing & stock
}

// ── Ingredients library (stock take + costing) ───────────────────────────────

export type PackUnit = 'kg' | 'L' | 'unit'

export type IngredientFormat = 'bottle' | 'keg' | 'bag-in-box' | 'drum' | 'bag' | 'other'
export const INGREDIENT_FORMATS: { value: IngredientFormat; label: string }[] = [
  { value: 'bottle', label: 'Bottle' },
  { value: 'keg', label: 'Keg' },
  { value: 'bag-in-box', label: 'Bag-in-box' },
  { value: 'drum', label: 'Drum' },
  { value: 'bag', label: 'Bag' },
  { value: 'other', label: 'Other' },
]

export type Currency = 'GBP' | 'EUR' | 'USD'
export const CURRENCY_SYMBOLS: Record<Currency, string> = { GBP: '£', EUR: '€', USD: '$' }

// Units used when measuring an ingredient inside a recipe or process
export type RecipeUnit = 'g' | 'kg' | 'ml' | 'L' | 'unit'

// A component of a "process" ingredient (e.g. lemon juice = water + limes + time)
export interface SubIngredient {
  ingredientId: string
  name: string
  amount: number
  unit: RecipeUnit
}

export interface Ingredient {
  id: string
  name: string                  // canonical display name, e.g. "Citric Acid"
  nameKey: string               // normalised for dedup: lowercase, trimmed, single spaces
  supplier?: string
  format?: IngredientFormat     // how it arrives: bottle / keg / bag-in-box / drum...
  currency?: Currency           // price currency (default GBP)
  // Process ingredients — made in-house from other ingredients
  isProcess?: boolean
  processDescription?: string   // quick description of how it's made
  laborMinutes?: number         // ACTIVE labour only (not resting/distilling time)
  subIngredients?: SubIngredient[]
  // For processes: packSize = yield amount, packUnit = yield unit, packPrice = summed cost
  packDescription: string       // human label, e.g. "0.7L bottle", "25kg drum"
  packSize: number              // size of ONE pack in packUnit, e.g. 0.7
  packUnit: PackUnit            // what the pack is measured in
  packPrice: number             // £ per pack (what you pay the supplier)
  pricePerUnit: number          // derived: £ per kg / L — used for recipe COGS
  currentStock: number          // stock on hand, in packs (fractional allowed)
  stockUpdatedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export type StockMovementType = 'stocktake' | 'delivery' | 'production' | 'adjustment'

export interface StockMovement {
  id: string
  ingredientId: string
  ingredientName: string
  type: StockMovementType
  packsDelta: number            // +ve for deliveries, -ve for production; for stocktake = new absolute value
  newStock: number              // stock (in packs) after this movement
  orderId?: string              // for production deductions
  orderNumber?: string
  note?: string
  createdAt: Date
}

export interface RecipeAnalytical {
  name: string
  min?: number
  target?: number
  max?: number
  notes?: string
}

export interface Recipe {
  id: string
  name: string
  variation?: string
  version?: string
  createdBy?: string
  dateCreated?: string
  productId?: string
  productCode?: string
  productName?: string
  ingredients: RecipeIngredient[]
  analyticalValues: RecipeAnalytical[]
  cookingInstructions: string
  approxTimeMinutes?: number    // rough start-to-finish time to cook one batch
  status: 'active' | 'discontinued'
  createdAt: Date
  updatedAt: Date
}

// ── Imported recipe drafts awaiting approval ─────────────────────────────────

export interface DraftIngredientRow {
  name: string
  qtyPer1L: number
  matched: boolean              // true when it maps to an ingredient in the library
}

export interface RecipeDraftDoc {
  id: string
  kind: 'recipe' | 'process'
  name: string
  client?: string
  version?: string
  sourceFile: string
  confidence: number            // 0-100
  matchedProductId?: string
  matchedProductName?: string
  matchedProductCode?: string
  productHasRecipe?: boolean
  ingredients: DraftIngredientRow[]
  analyticalValues: RecipeAnalytical[]
  cookingInstructions: string
  approxTimeMinutes?: number
  laborMinutes?: number
  status: 'pending'
  createdAt: Date
}

export type OrderType = 'order' | 'rd'
export type RdStatus  = 'in_progress' | 'completed' | 'on_hold'

export type OrderCategory = 'cocktail_production' | 'cocktail_rd' | 'wine_consulting' | 'popsicles' | 'baek' | 'other'

export interface Order {
  id: string
  orderNumber: string
  accountId: string
  accountName: string
  groupId?: string
  groupName?: string
  type?: OrderType
  category?: OrderCategory
  businessLine?: BusinessLine
  briefingDate?: Date
  status: OrderStatus
  lineItems: OrderLineItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  notes?: string
  poReference?: string
  source?: string
  portalContactName?: string
  termsAccepted?: boolean
  termsAcceptedAt?: Date
  termsVersion?: string
  stockDeducted?: boolean       // ingredients already deducted from stock (set when production starts)
  expectedDeliveryDate?: Date
  deliveryNoteNumber?: string
  deliveryNoteUrl?: string
  signedDeliveryNoteUrl?: string
  invoiceNumber?: string
  invoiceUrl?: string
  deliveryDate?: Date
  rdStatus?: RdStatus
  rdAssignee?: string
  rdStartDate?: Date
  rdEndDate?: Date
  rdBrief?: string
  rdOutcomes?: string[]
  rdPrice?: number
  createdAt: Date
  updatedAt: Date
}

export interface Payment {
  id: string
  orderId: string
  orderNumber: string
  accountId: string
  accountName: string
  invoiceNumber: string
  amount: number
  dueDate: Date
  paidDate?: Date
  status: PaymentStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface DashboardStats {
  totalRevenueMTD: number
  totalOutstanding: number
  ordersThisMonth: number
  overdueCount: number
}
// ── Projects (pipeline board) ────────────────────────────────────────────────
// A project is any piece of work with an owner and a date. R&D orders surface
// here automatically; standalone projects (a range launch, a tasting, a
// workstream) live only in the `projects` collection.

export type ProjectKind = 'rd' | 'range' | 'commercial' | 'ops' | 'brand' | 'other'

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  rd:         'R&D',
  range:      'Range',
  commercial: 'Commercial',
  ops:        'Ops',
  brand:      'Brand',
  other:      'Other',
}

export type ProjectStage =
  | 'brief'
  | 'development'
  | 'tasting'
  | 'sign_off'
  | 'launch'
  | 'done'
  | 'parked'

export const PROJECT_STAGES: { value: ProjectStage; label: string }[] = [
  { value: 'brief',       label: 'Brief' },
  { value: 'development', label: 'Development' },
  { value: 'tasting',     label: 'Tasting' },
  { value: 'sign_off',    label: 'Sign-off' },
  { value: 'launch',      label: 'Launch' },
  { value: 'done',        label: 'Done' },
  { value: 'parked',      label: 'Parked' },
]

// Set in the ranking session: the month's top list, or parked with a date.
export type ProjectDecision = 'top' | 'parked'

// A step on a project. Dates are ISO strings — they live inside an array, and
// Firestore Timestamps in arrays have to be converted by hand on every read.
export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  doneAt?: string
  owner?: string
  due?: string
}

export type UpdateKind = 'note' | 'auto'

export interface ProjectUpdate {
  at: string
  text: string
  kind: UpdateKind
  by?: string
}

export interface Project {
  id: string
  title: string
  kind: ProjectKind
  accountName?: string
  stage: ProjectStage

  owner?: string                // single accountable name
  assignees?: string[]          // everyone else on it
  dueDate?: Date
  nextStep?: string

  blocker?: string              // what is actually stopping it
  gatekeeper?: string           // who has to say yes

  // Ranking criteria — opportunity × size of prize ÷ effort
  opportunity?: number          // 1–5, does it open a door
  prizeGbp?: number             // £/yr if it lands — the quote
  effortDays?: number           // bench days it eats

  scope?: string                // what done looks like, in plain words
  checklist?: ChecklistItem[]
  updates?: ProjectUpdate[]     // newest first

  decision?: ProjectDecision
  parkedUntil?: Date
  outcome?: string

  linkedOrderId?: string        // the R&D order this came from, if any
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// Priority score: money (in £k) weighted by how many doors it opens,
// divided by the bench days it costs. Higher ranks first.
export function projectScore(p: Pick<Project, 'opportunity' | 'prizeGbp' | 'effortDays'>): number | null {
  const opp = p.opportunity ?? 0
  const prize = p.prizeGbp ?? 0
  const days = p.effortDays ?? 0
  if (!opp || !prize || !days) return null
  return Math.round(((prize / 1000) * opp) / Math.max(days, 0.5) * 10) / 10
}

// ── The ten classics ─────────────────────────────────────────────────────────
// The range the costing sheet, the rate card and the Pernod menu obligations
// all hang off. Names here are matched loosely against product names, which
// carry suffixes like "TMS" and house variations.

export const CLASSIC_COCKTAILS = [
  'Margarita',
  'G+T',
  'Dry Martini',
  'Dirty Martini',
  'Negroni',
  'Old Fashioned',
  'Manhattan',
  'Cosmopolitan',
  'Espresso Martini',
  'Whiskey Sour',
] as const

// "Spicy Margarita TMS" → matches "Margarita"; "Lychee Martini" must not.
export function matchesClassic(productName: string): string | null {
  const n = productName.toLowerCase().replace(/\btms\b/g, ' ').replace(/[^a-z+ ]/g, ' ').replace(/\s+/g, ' ').trim()
  // Longest first, so "Dry Martini" wins over a bare "Martini" fragment.
  const ordered = [...CLASSIC_COCKTAILS].sort((a, b) => b.length - a.length)
  for (const c of ordered) {
    const key = c.toLowerCase()
    if (n === key || n.startsWith(key + ' ') || n.endsWith(' ' + key) || n.includes(' ' + key + ' ')) return c
  }
  return null
}

// Progress from the checklist — the honest "how far along is this".
export function projectProgress(p: Pick<Project, 'checklist'>): { done: number; total: number; pct: number } | null {
  const list = p.checklist ?? []
  if (!list.length) return null
  const done = list.filter((i) => i.done).length
  return { done, total: list.length, pct: Math.round((done / list.length) * 100) }
}
