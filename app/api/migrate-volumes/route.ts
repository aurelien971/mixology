import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// These two products are 19L for Heard Borough only
const HEARD_BOROUGH_19L = ['Spicy Margarita', 'Olive Oil Negroni']
const HEARD_BOROUGH     = 'Heard Borough'

function r2(n: number) { return Math.round(n * 100) / 100 }

export async function GET() {
  const log: string[] = []
  let productsUpdated = 0
  let pricingUpdated  = 0

  try {
    // ── 1. Products: set volumeLitres = 5 on every product ──────────────────
    const productsSnap = await getDocs(collection(db, 'products'))
    for (const d of productsSnap.docs) {
      const data = d.data() as Record<string, any>
      await updateDoc(d.ref, {
        volumeLitres:     5,
        availableVolumes: null,   // clean up old field
        updatedAt:        Timestamp.now(),
      })
      log.push(`product: ${data.name} (${data.productCode}) → 5L`)
      productsUpdated++
    }

    // ── 2. accountPricing: pricePerUnit = pricePerLitre × volumeLitres ──────
    //  • Default:              5L  → pricePerUnit = pricePerLitre × 5
    //  • Heard Borough special: 19L → pricePerUnit = pricePerLitre × 19
    const pricingSnap = await getDocs(collection(db, 'accountPricing'))
    for (const d of pricingSnap.docs) {
      const p    = d.data() as Record<string, any>
      const ppl  = p.pricePerLitre as number ?? 0

      const isHeardBorough19L =
        p.accountName === HEARD_BOROUGH &&
        HEARD_BOROUGH_19L.includes(p.productName as string)

      const volumeLitres = isHeardBorough19L ? 19 : 5
      const pricePerUnit = r2(ppl * volumeLitres)

      await updateDoc(d.ref, {
        volumeLitres,
        pricePerUnit,
        updatedAt: Timestamp.now(),
      })

      log.push(
        `pricing: ${p.accountName} / ${p.productName} → ` +
        `${volumeLitres}L @ £${pricePerUnit.toFixed(2)} per bag ` +
        `(£${ppl.toFixed(2)}/L × ${volumeLitres})`
      )
      pricingUpdated++
    }

    return NextResponse.json({
      success: true,
      counts: { productsUpdated, pricingUpdated },
      log,
      note: 'All products = 5L bags. Heard Borough Spicy Margarita + Olive Oil Negroni = 19L kegs.',
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}