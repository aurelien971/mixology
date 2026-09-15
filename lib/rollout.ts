import { differenceInCalendarDays, startOfDay } from 'date-fns'
import {
  Account, Order, RolloutVenue, RolloutStage, RolloutContact, RangeStatus, DevVariant,
  TastingSession, ROLLOUT_STEPS,
} from '@/types'

/**
 * The rules of the rollout, in one place so the board and the popup agree.
 */

/** Onboarded means this many orders with range drinks inside the window. */
export const RECURRING_ORDERS = 3
export const RECURRING_WINDOW_DAYS = 42
/** An order this recent gets a NEW badge on the board. */
export const NEW_ORDER_DAYS = 3
/** Nothing logged and nothing ordered for this long needs a nudge. */
export const QUIET_DAYS = 7

export interface VenueSeed { name: string; group?: string; match: string[]; createIfMissing?: boolean }

// The venues in the rollout, matched to accounts by trading name. "Covent
// Garden" is Heard's third site; the board calls it that without renaming the
// account, whose name is on its invoices.
export const ROLLOUT_SEED: VenueSeed[] = [
  { name: 'Sino',                match: ['sino'] },
  { name: 'Pyro',                match: ['pyro'] },
  { name: 'Flat Iron',           match: ['flat iron', 'flatiron square', 'flat iron square'] },
  { name: 'Spring Street Pizza', match: ['spring street pizza'] },
  { name: 'Goodies',             match: ['goodies'], createIfMissing: true },
  { name: 'Oudh 1722',           match: ['oudh 1722', 'oudh'] },
  { name: 'Heard Soho',          group: 'Heard', match: ['heard soho'] },
  { name: 'Heard Borough',       group: 'Heard', match: ['heard borough'] },
  { name: 'Heard Covent Garden', group: 'Heard', match: ['heard covent garden', 'covent garden'] },
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function findSeedAccount(seed: VenueSeed, accounts: Account[]): Account | undefined {
  const keys = seed.match.map(norm)
  return accounts.find((a) => keys.includes(norm(a.tradingName || '')))
    ?? accounts.find((a) => keys.includes(norm(a.legalName || '')))
}

const GENERIC_INBOX = new Set(['orders', 'order', 'info', 'hello', 'accounts', 'account', 'admin', 'bookings', 'contact', 'office', 'bar', 'team', 'finance', 'invoices'])

/**
 * A first contact from the account email, when the address is clearly a
 * person ("ruhit@…", "ben.kussan@…"). Shared inboxes are left alone.
 */
export function contactFromAccount(a: Account): RolloutContact | null {
  const local = (a.email || '').split('@')[0]?.toLowerCase() ?? ''
  if (!local || GENERIC_INBOX.has(local) || !/^[a-z]+([._-][a-z]+)?$/.test(local)) return null
  const name = local.split(/[._-]/).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  return { id: Math.random().toString(36).slice(2, 10), name, email: a.email, role: 'From the account email — check' }
}

export interface VenueOrders {
  all: Order[]          // every real order, newest first
  since: Order[]        // since the rollout began
  range: Order[]        // since the rollout began, with at least one range drink
  inWindow: number      // range orders in the last six weeks
  recurring: boolean
  last?: Order
  isNew: boolean
}

export function venueOrders(v: RolloutVenue, orders: Order[], rangeIds: Set<string>, now = new Date()): VenueOrders {
  const all = orders
    .filter((o) => o.accountId === v.accountId && o.status !== 'cancelled' && o.type !== 'rd')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const since = all.filter((o) => o.createdAt >= v.startedAt)
  const range = since.filter((o) => o.lineItems.some((li) => rangeIds.has(li.productId)))

  // Onboarded once any six-week stretch holds three range orders — and it
  // stays onboarded, the same way a first order stays a first order.
  const asc = [...range].reverse()
  let best = 0
  for (let i = 0; i < asc.length; i++) {
    let n = 0
    for (let j = i; j < asc.length; j++) {
      if (differenceInCalendarDays(asc[j].createdAt, asc[i].createdAt) <= RECURRING_WINDOW_DAYS) n++
    }
    best = Math.max(best, n)
  }
  const inWindow = range.filter((o) => differenceInCalendarDays(now, o.createdAt) <= RECURRING_WINDOW_DAYS).length
  const last = all[0]
  return {
    all, since, range, inWindow, recurring: best >= RECURRING_ORDERS, last,
    isNew: !!last && differenceInCalendarDays(now, last.createdAt) <= NEW_ORDER_DAYS,
  }
}

/** The step the venue is really on: orders move the last two on their own. */
export function effectiveStage(v: RolloutVenue, o: VenueOrders): RolloutStage {
  if (v.stage === 'paused' || v.stage === 'lost') return v.stage
  if (o.recurring) return 'recurring'
  if (o.range.length > 0) return 'first_order'
  return v.stage
}

export const stepIndex = (stage: RolloutStage) => ROLLOUT_STEPS.findIndex((s) => s.value === stage)

/** The next step you move to by hand, if there is one. */
export function nextManualStage(stage: RolloutStage): RolloutStage | null {
  const i = stepIndex(stage)
  const next = ROLLOUT_STEPS[i + 1]
  return next && !next.auto ? next.value : null
}

/**
 * Where one drink stands with this venue. A status set by hand wins; otherwise
 * the most recent tasting verdict; otherwise "tasted" if it was poured.
 */
export function drinkStatus(
  manual: RangeStatus | undefined,
  productId: string,
  variant: DevVariant,
  tastings: TastingSession[]
): { status?: RangeStatus; fromTasting: boolean } {
  if (manual) return { status: manual, fromTasting: false }
  const poured = tastings
    .filter((t) => t.items.some((i) => i.productId === productId && i.variant === variant))
    .sort((a, b) => (b.scheduledAt ?? b.updatedAt).getTime() - (a.scheduledAt ?? a.updatedAt).getTime())
  for (const t of poured) {
    const item = t.items.find((i) => i.productId === productId && i.variant === variant)
    if (item && item.verdict !== 'pending') return { status: item.verdict, fromTasting: true }
  }
  return poured.length ? { status: 'tasted', fromTasting: true } : { status: undefined, fromTasting: false }
}

/** Why a venue needs looking at, in plain words — or null when it does not. */
export function needsAttention(v: RolloutVenue, stage: RolloutStage, o: VenueOrders, now = new Date()): string | null {
  if (stage === 'recurring' || stage === 'paused' || stage === 'lost') return null
  if (!(v.contacts ?? []).length) return 'No contact yet'
  if (v.nextStepDue && v.nextStepDue < startOfDay(now)) return `Next step ${differenceInCalendarDays(now, v.nextStepDue)}d late`
  if (!v.nextStep) return 'No next step'
  const lastTouch = [v.updatedAt, o.last?.createdAt].filter((d): d is Date => !!d).reduce((a, b) => (b > a ? b : a))
  const quiet = differenceInCalendarDays(now, lastTouch)
  if (quiet >= QUIET_DAYS) return `Quiet ${quiet} days`
  return null
}

export function mainContact(v: RolloutVenue): RolloutContact | undefined {
  const list = v.contacts ?? []
  return list.find((c) => c.decides) ?? list[0]
}
