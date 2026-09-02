import { NextResponse } from 'next/server'
import { collection, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Anthropic from '@anthropic-ai/sdk'
import { resolvePeriod, PeriodKey, defaultPeriod } from '@/lib/reportPeriod'

export const maxDuration = 120

function r2(n: number) { return Math.round(n * 100) / 100 }

interface Line { productId: string; productName: string; quantity: number; volumeLitres?: number; lineTotal: number }
interface Ord { accountName: string; createdAt: Date; subtotal: number; lines: Line[] }

export async function POST(req: Request) {
  let periodKey: PeriodKey = defaultPeriod()
  try {
    const body = await req.json()
    if (body?.period) periodKey = body.period as PeriodKey
  } catch { /* no body — use the default */ }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }, { status: 500 })
  }
  try {
    const snap = await getDocs(collection(db, 'orders'))
    const orders: Ord[] = snap.docs
      .map(d => d.data())
      .filter(o => o.status !== 'cancelled' && o.type !== 'rd')
      .map(o => ({
        accountName: String(o.accountName ?? ''),
        createdAt: (o.createdAt as Timestamp)?.toDate?.() ?? new Date(0),
        subtotal: Number(o.subtotal) || 0,
        lines: (o.lineItems ?? []) as Line[],
      }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    const now = new Date()
    const period = resolvePeriod(periodKey, now)
    const litresOf = (o: Ord) => o.lines.reduce((s, l) => s + l.quantity * (l.volumeLitres ?? 5), 0)

    // Period aggregates
    const agg = (from: Date, to: Date) => {
      const sel = orders.filter(o => o.createdAt >= from && o.createdAt < to)
      const byAccount: Record<string, { revenue: number; litres: number; orders: number }> = {}
      let revenue = 0, litres = 0
      for (const o of sel) {
        revenue += o.subtotal; litres += litresOf(o)
        const a = byAccount[o.accountName] ?? { revenue: 0, litres: 0, orders: 0 }
        a.revenue = r2(a.revenue + o.subtotal); a.litres = r2(a.litres + litresOf(o)); a.orders++
        byAccount[o.accountName] = a
      }
      return { revenue: r2(revenue), litres: r2(litres), orders: sel.length, byAccount }
    }
    const current = agg(period.from, period.to)
    const prior = agg(period.priorFrom, period.priorTo)

    // Monthly revenue history → record detection
    const monthly: Record<string, number> = {}
    for (const o of orders) {
      const k = o.createdAt.toISOString().slice(0, 7)
      monthly[k] = r2((monthly[k] ?? 0) + o.subtotal)
    }
    const currentMonthKey = now.toISOString().slice(0, 7)

    // Account cadence / lapse flags
    const lapsed: { account: string; daysSinceLastOrder: number; typicalGapDays: number; lastOrderDate: string }[] = []
    const accDates: Record<string, Date[]> = {}
    for (const o of orders) (accDates[o.accountName] ??= []).push(o.createdAt)
    for (const [acc, dates] of Object.entries(accDates)) {
      if (dates.length < 2) continue
      const gaps = dates.slice(1).map((d, i) => (d.getTime() - dates[i].getTime()) / 86400000).sort((a, b) => a - b)
      const median = gaps[Math.floor(gaps.length / 2)]
      const daysSince = (now.getTime() - dates[dates.length - 1].getTime()) / 86400000
      if (daysSince > Math.max(21, 2 * median)) {
        lapsed.push({ account: acc, daysSinceLastOrder: Math.round(daysSince), typicalGapDays: Math.round(median), lastOrderDate: dates[dates.length - 1].toISOString().slice(0, 10) })
      }
    }

    // Account+product churn: ordered ≥3 times historically, nothing in 45 days
    const pairSeen: Record<string, { dates: Date[]; litres: number; account: string; product: string }> = {}
    for (const o of orders) {
      for (const l of o.lines) {
        if (!l.productName) continue
        const k = o.accountName + '§' + l.productName
        const p = pairSeen[k] ?? { dates: [], litres: 0, account: o.accountName, product: l.productName }
        p.dates.push(o.createdAt); p.litres += l.quantity * (l.volumeLitres ?? 5)
        pairSeen[k] = p
      }
    }
    const stoppedDrinks = Object.values(pairSeen)
      .filter(p => p.dates.length >= 3 && (now.getTime() - p.dates[p.dates.length - 1].getTime()) / 86400000 > 45)
      .map(p => ({ account: p.account, drink: p.product, timesOrdered: p.dates.length, lastOrdered: p.dates[p.dates.length - 1].toISOString().slice(0, 10), lifetimeLitres: r2(p.litres) }))
      .sort((a, b) => b.lifetimeLitres - a.lifetimeLitres)
      .slice(0, 12)

    // Product movers last30 vs prev30
    const prodPeriod = (from: Date, to: Date) => {
      const m: Record<string, number> = {}
      for (const o of orders.filter(x => x.createdAt >= from && x.createdAt < to)) {
        for (const l of o.lines) m[l.productName] = r2((m[l.productName] ?? 0) + l.quantity * (l.volumeLitres ?? 5))
      }
      return m
    }
    const pNow = prodPeriod(period.from, period.to)
    const pPrev = prodPeriod(period.priorFrom, period.priorTo)
    const movers = [...new Set([...Object.keys(pNow), ...Object.keys(pPrev)])]
      .map(name => ({ drink: name, litres: pNow[name] ?? 0, litresPrior: pPrev[name] ?? 0, delta: r2((pNow[name] ?? 0) - (pPrev[name] ?? 0)) }))
      .filter(x => Math.abs(x.delta) >= 15)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10)

    // First-ever orders in the last 30 days (new drinks / new accounts)
    const firstOrderByAccount: Record<string, Date> = {}
    for (const o of orders) if (!firstOrderByAccount[o.accountName]) firstOrderByAccount[o.accountName] = o.createdAt
    const newAccounts = Object.entries(firstOrderByAccount).filter(([, d]) => d >= period.from).map(([a]) => a)

    const stats = {
      generatedAt: now.toISOString().slice(0, 10),
      period: {
        key: period.key,
        label: period.label,
        priorLabel: period.priorLabel,
        partial: period.partial,
        from: period.from.toISOString().slice(0, 10),
        to: period.to.toISOString().slice(0, 10),
      },
      current, prior,
      monthlyRevenueHistory: monthly,
      currentMonthKey,
      lapsedAccounts: lapsed,
      stoppedOrderingDrinks: stoppedDrinks,
      biggestDrinkMovers: movers,
      newAccounts,
      note: 'Historical pre-April orders are monthly aggregates, so pre-April dates are month-stamps rather than real order dates. Revenue is ex-VAT GBP. Litres ≈ kg.',
    }

    const client = new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 3000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `You write the weekly status brief for Foodlab, a London cocktail production company, ahead of their "Foodlab Weekly" call. You are given pre-computed, exact statistics — never invent or recalculate numbers; quote them as given (round for readability). Write in British English, GBP.

Structure (markdown, keep the whole thing tight — it gets read aloud in a meeting):
## Headline
2-3 sentences: revenue/litres/orders for the period named in stats.period.label, against stats.period.priorLabel, with % change. If stats.period.partial is true, say so plainly and do not project or imply a full-period total. Compare against monthly history for context — only claim a record if the numbers genuinely support it.
## By account
One bullet per active account: revenue & litres for the period, vs the prior period, anything notable.
## Drinks watch
Biggest movers up/down (litres) for the period. Then the "stopped ordering" signals: account × drink pairs that used to order regularly but have gone quiet — these are the easy-to-miss ones, call them out with how long it's been.
## Flags
Lapsed accounts (past their usual ordering rhythm), new accounts, anything else material. If nothing, say so in one line. Where pre-April dates cluster on the 1st of a month, say that is the aggregate artefact rather than a real date.

No filler, no advice unless a number screams it. Every claim must trace to the provided stats.`,
      messages: [{ role: 'user', content: `Reporting period: ${period.label}, against ${period.priorLabel}.\n\n${JSON.stringify(stats)}` }],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The AI declined to generate the brief.' }, { status: 422 })
    }
    const brief = response.content.find(b => b.type === 'text')?.text ?? ''
    return NextResponse.json({ success: true, brief, stats })
  } catch (error) {
    console.error('weekly-brief error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
