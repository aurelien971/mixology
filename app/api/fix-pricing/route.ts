import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Source-of-truth pricePerLitre values from your original PDFs.
// Key: `${accountName}::${productName}` → correct pricePerLitre
const CORRECT_PRICES: Record<string, number> = {
  // Spring Street — source PDF says £20.50, our calc gave £20.55
  'Spring Street Pizza::Mezcal Negroni':         20.50,
  'Spring Street Pizza::Mezcal Spicy Margarita': 20.50,
  // Pyro — minor rounding differences
  'Pyro::Aegeas G+T':              21.12,
  'Pyro::Thyme & Pomegranate':     22.04,
  'Pyro::Melon & Lemon Verbena':   21.18,
  'Pyro::Mountain Ice Tea':        21.58,
  'Pyro::Aegeas':                  35.30,
  'Pyro::Negroni TMS':             33.30,
  'Pyro::Spicy Margarita TMS':     22.50,
  'Pyro::Daphne':                  43.56,
  'Pyro::Smoked Artichoke Spicy Margarita': 26.62,
  // Sino
  'Sino::GlassHouse': 29.64,
}

export async function GET() {
  try {
    const snap = await getDocs(collection(db, 'accountPricing'))
    const results: string[] = []
    let updated = 0

    for (const d of snap.docs) {
      const data = d.data()
      const key = `${data.accountName}::${data.productName}`
      const correctPrice = CORRECT_PRICES[key]

      if (correctPrice !== undefined && data.pricePerLitre !== correctPrice) {
        await updateDoc(d.ref, {
          pricePerLitre: correctPrice,
          updatedAt: Timestamp.now(),
        })
        results.push(`Fixed: ${key} — was £${data.pricePerLitre?.toFixed(2)}, now £${correctPrice.toFixed(2)}`)
        updated++
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      results,
      message: updated === 0 ? 'All prices already correct' : `Fixed ${updated} pricing records`,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}