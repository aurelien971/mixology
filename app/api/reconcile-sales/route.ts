import { NextRequest, NextResponse } from 'next/server'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const maxDuration = 300

// Reconcile historical (pre-platform) sales into orders.
// POST { dryRun: true|false, orders: [{ venue, period, dateISO, lines: [{name, kg, total, units?}] }] }
// dryRun returns the full match report; only dryRun:false writes.

interface InLine { name: string; kg: number; total: number; units?: number }
interface InOrder { venue: string; period: string; dateISO: string; lines: InLine[] }

function norm(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/\+/g, ' ').replace(/n\/a/g, 'na')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokenScore(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter(Boolean))
  const tb = new Set(norm(b).split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0; ta.forEach(t => { if (tb.has(t)) inter++ })
  return inter / Math.max(ta.size, tb.size)
}

// One-off: give Heard Borough historical orders distinct order numbers
export async function PUT() {
  try {
    const snap = await getDocs(collection(db, 'orders'))
    const { updateDoc } = await import('firebase/firestore')
    let updated = 0
    const changes: string[] = []
    for (const d of snap.docs) {
      const num = String(d.data().orderNumber ?? '')
      const acc = String(d.data().accountName ?? '')
      if (num.startsWith('HIST-') && num.endsWith('-HEARD') && acc === 'Heard Borough') {
        const next = num.replace(/-HEARD$/, '-HEARDBOR')
        await updateDoc(d.ref, { orderNumber: next, updatedAt: Timestamp.now() })
        changes.push(`${num} (${acc}) → ${next}`)
        updated++
      }
    }
    return NextResponse.json({ success: true, updated, changes })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

// Re-date all historical orders to the FIRST of their period's month
// (HIST-Q3-2025-* → 2025-07-01, HIST-YYYY-MM-* → YYYY-MM-01)
export async function PATCH() {
  try {
    const snap = await getDocs(collection(db, 'orders'))
    let updated = 0
    const changes: string[] = []
    for (const d of snap.docs) {
      const num = String(d.data().orderNumber ?? '')
      if (!num.startsWith('HIST-')) continue
      let dateISO: string | null = null
      const q = num.match(/^HIST-Q(\d)-(\d{4})-/)
      const m = num.match(/^HIST-(\d{4})-(\d{2})-/)
      if (q) dateISO = `${q[2]}-${String((parseInt(q[1], 10) - 1) * 3 + 1).padStart(2, '0')}-01`
      else if (m) dateISO = `${m[1]}-${m[2]}-01`
      if (!dateISO) continue
      const target = new Date(dateISO + 'T12:00:00')
      const cur = (d.data().createdAt as Timestamp)?.toDate?.()
      if (cur && Math.abs(cur.getTime() - target.getTime()) < 86400000) continue
      const { updateDoc } = await import('firebase/firestore')
      await updateDoc(d.ref, {
        createdAt: Timestamp.fromDate(target),
        deliveryDate: Timestamp.fromDate(target),
        updatedAt: Timestamp.now(),
      })
      changes.push(`${num} → ${dateISO}`)
      updated++
    }
    return NextResponse.json({ success: true, updated, changes })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dryRun, orders, createMissingProducts } = await req.json() as { dryRun: boolean; orders: InOrder[]; createMissingProducts?: boolean }
    if (!orders?.length) return NextResponse.json({ error: 'No orders' }, { status: 400 })

    const [accSnap, prodSnap, ordSnap] = await Promise.all([
      getDocs(collection(db, 'accounts')),
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'orders')),
    ])
    const accounts = accSnap.docs.map(d => ({ id: d.id, tradingName: String(d.data().tradingName ?? ''), legalName: String(d.data().legalName ?? '') }))
    const products = prodSnap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? ''), productCode: String(d.data().productCode ?? ''), volumeLitres: Number(d.data().volumeLitres) || 5, recommendedServingG: Number(d.data().recommendedServingG) || 200 }))
    const existingNumbers = new Set(ordSnap.docs.map(d => String(d.data().orderNumber ?? '')))

    // Next free FL-100xxx product code for drinks we need to create
    let nextCode = 1 + prodSnap.docs.reduce((mx, d) => {
      const m = String(d.data().productCode ?? '').match(/^FL-100(\d+)$/)
      return m ? Math.max(mx, parseInt(m[1], 10)) : mx
    }, 0)
    const createdProducts: { name: string; code: string }[] = []
    const createProduct = async (name: string) => {
      const code = `FL-100${String(nextCode++).padStart(3, '0')}`
      const now = Timestamp.now()
      const ref = await addDoc(collection(db, 'products'), {
        productCode: code,
        name,
        costToMake: 0,
        costMissing: true,
        recommendedServingG: 200,
        volumeLitres: 5,
        baseCode: code,
        isNonAlcoholic: /n\/a|non.?alcoholic/i.test(name),
        isCoreRange: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      const p = { id: ref.id, name, productCode: code, volumeLitres: 5, recommendedServingG: 200 }
      products.push(p)
      createdProducts.push({ name, code })
      return p
    }

    const matchAccount = (venue: string) => {
      let best: { a: typeof accounts[0]; s: number } | null = null
      for (const a of accounts) {
        const s = Math.max(
          norm(a.tradingName) === norm(venue) ? 1 : 0,
          norm(a.tradingName).includes(norm(venue)) || norm(venue).includes(norm(a.tradingName)) ? 0.85 : 0,
          tokenScore(a.tradingName, venue) * 0.8,
          tokenScore(a.legalName, venue) * 0.7,
        )
        if (!best || s > best.s) best = { a, s }
      }
      return best && best.s >= 0.5 ? best.a : null
    }
    const matchProduct = (name: string) => {
      let best: { p: typeof products[0]; s: number } | null = null
      for (const p of products) {
        const pn = norm(p.name), n = norm(name)
        const s = pn === n ? 1 : (pn.includes(n) || n.includes(pn)) ? 0.85 : tokenScore(p.name, name) * 0.8
        if (!best || s > best.s) best = { p, s }
      }
      return best && best.s >= 0.55 ? best : null
    }

    const report: Record<string, unknown>[] = []
    let written = 0

    for (const o of orders) {
      const account = matchAccount(o.venue)
      const short = o.venue.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5)
      const orderNumber = `HIST-${o.period.replace(/\s+/g, '')}-${short}`
      const lines = []
      for (const l of o.lines.filter(x => x.kg > 0 || x.total > 0)) {
        let m = matchProduct(l.name)
        if (!m && createMissingProducts && !dryRun) {
          const p = await createProduct(l.name.trim().replace(/\s+/g, ' '))
          m = { p, s: 1 }
        }
        lines.push({
          sheetName: l.name,
          matched: m ? { id: m.p.id, code: m.p.productCode, name: m.p.name, score: Math.round(m.s * 100) } : null,
          kg: Math.round(l.kg * 100) / 100,
          total: Math.round(l.total * 100) / 100,
        })
      }
      const subtotal = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100
      const litres = Math.round(lines.reduce((s, l) => s + l.kg, 0) * 100) / 100
      const entry: Record<string, unknown> = {
        orderNumber,
        period: o.period,
        venue: o.venue,
        account: account ? account.tradingName : null,
        alreadyExists: existingNumbers.has(orderNumber),
        litres, subtotal,
        lines,
        unmatchedProducts: lines.filter(l => !l.matched).map(l => l.sheetName),
      }
      report.push(entry)

      if (!dryRun && account && !existingNumbers.has(orderNumber) && lines.length > 0) {
        const now = Timestamp.now()
        const vatAmount = Math.round(subtotal * 0.2 * 100) / 100
        await addDoc(collection(db, 'orders'), {
          orderNumber,
          accountId: account.id,
          accountName: account.tradingName,
          type: 'order',
          status: 'delivered',
          source: 'historical_import',
          notes: `Historical sales import — ${o.period} (pre-platform reconciliation)`,
          lineItems: lines.map(l => ({
            productId: l.matched?.id ?? '',
            productCode: l.matched?.code ?? '',
            productName: l.matched?.name ?? l.sheetName,
            volumeLitres: l.kg,
            quantity: 1,
            unitPrice: l.total,
            lineTotal: l.total,
            servingSizeG: 0,
          })),
          subtotal,
          vatRate: 0.2,
          vatAmount,
          total: Math.round((subtotal + vatAmount) * 100) / 100,
          stockDeducted: true,   // historical — never touch stock
          termsAccepted: false,
          createdAt: Timestamp.fromDate(new Date(o.dateISO)),
          updatedAt: now,
          deliveryDate: Timestamp.fromDate(new Date(o.dateISO)),
        })
        entry.written = true
        written++
      }
    }

    return NextResponse.json({ success: true, dryRun, written, createdProducts, report })
  } catch (error) {
    console.error('reconcile-sales error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
