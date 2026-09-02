/**
 * Reporting windows.
 *
 * A rolling thirty days is the wrong frame two days into a month: on 2 September
 * it mostly describes August but calls it "the last 30 days", and nobody reports
 * to investors on a window that slides. These are named periods with an
 * equivalent prior window, so a comparison is always like for like.
 */

export type PeriodKey = 'lastMonth' | 'monthToDate' | 'last30' | 'lastQuarter' | 'yearToDate'

export interface Period {
  key: PeriodKey
  label: string
  /** Inclusive start, exclusive end. */
  from: Date
  to: Date
  priorFrom: Date
  priorTo: Date
  priorLabel: string
  /** True when the window has not finished, so a total is not yet comparable. */
  partial: boolean
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

function monthLabel(d: Date) { return `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }

export function resolvePeriod(key: PeriodKey, now = new Date()): Period {
  const thisMonth = startOfMonth(now)

  switch (key) {
    case 'lastMonth': {
      const from = addMonths(thisMonth, -1)
      return {
        key, label: monthLabel(from), from, to: thisMonth,
        priorFrom: addMonths(thisMonth, -2), priorTo: from,
        priorLabel: monthLabel(addMonths(thisMonth, -2)),
        partial: false,
      }
    }
    case 'monthToDate': {
      const dayOfMonth = now.getDate()
      const priorFrom = addMonths(thisMonth, -1)
      // Same number of days into the previous month, so a part-month is not
      // compared against a whole one.
      const priorTo = new Date(priorFrom.getFullYear(), priorFrom.getMonth(), dayOfMonth)
      return {
        key, label: `${monthLabel(thisMonth)} so far`, from: thisMonth, to: now,
        priorFrom, priorTo,
        priorLabel: `${monthLabel(priorFrom)}, same ${dayOfMonth} days`,
        partial: true,
      }
    }
    case 'lastQuarter': {
      const q = Math.floor(now.getMonth() / 3)
      const from = new Date(now.getFullYear(), (q - 1) * 3, 1)
      const to = new Date(now.getFullYear(), q * 3, 1)
      const priorFrom = new Date(from.getFullYear(), from.getMonth() - 3, 1)
      return {
        key, label: `${monthLabel(from)} – ${MONTHS[new Date(to.getTime() - 1).getMonth()]}`,
        from, to, priorFrom, priorTo: from,
        priorLabel: 'the quarter before', partial: false,
      }
    }
    case 'yearToDate': {
      const from = new Date(now.getFullYear(), 0, 1)
      return {
        key, label: `${now.getFullYear()} so far`, from, to: now,
        priorFrom: new Date(now.getFullYear() - 1, 0, 1),
        priorTo: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
        priorLabel: `${now.getFullYear() - 1}, same point`,
        partial: true,
      }
    }
    default: {
      const from = new Date(now.getTime() - 30 * 86_400_000)
      return {
        key: 'last30', label: 'Last 30 days', from, to: now,
        priorFrom: new Date(now.getTime() - 60 * 86_400_000), priorTo: from,
        priorLabel: 'the 30 days before', partial: false,
      }
    }
  }
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'lastMonth',   label: 'Last full month' },
  { key: 'monthToDate', label: 'This month so far' },
  { key: 'last30',      label: 'Rolling 30 days' },
  { key: 'lastQuarter', label: 'Last quarter' },
  { key: 'yearToDate',  label: 'Year to date' },
]

/**
 * What to open on. Early in a month the month-to-date is too thin to mean
 * anything, so the last full month is the honest default.
 */
export function defaultPeriod(now = new Date()): PeriodKey {
  return now.getDate() <= 7 ? 'lastMonth' : 'monthToDate'
}
