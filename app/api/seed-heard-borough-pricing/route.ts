import { NextResponse } from 'next/server'
import {
  collection, getDocs, addDoc, query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

function r2(n: number) { return Math.round(n * 100) / 100 }

function venueGp(rrp: number, pricePerUnit: number, volumeLitres: number, servingG: number) {
  if (!rrp || !pricePerUnit || !servingG) return 0
  const servingsPerBag  = (volumeLitres * 1000) / servingG
  const bagRevenueExVat = (rrp / 1.2) * servingsPerBag
  return r2(((bagRevenueExVat - pricePerUnit) / bagRevenueExVat) * 100)
}

function foodlabGp(pricePerUnit: number, costToMake: number, volumeLitres: number, servingG: number) {
  if (!pricePerUnit || !costToMake || !servingG) return 0
  const servingsPerBag = (volumeLitres * 1000) / servingG
  const cogs = costToMake * servingsPerBag
  return r2(((pricePerUnit - cogs) / pricePerUnit) * 100)
}

// ── Pricing definitions ───────────────────────────────────────────────────────
// RRP = £12 per serving for both products
// pricePerLitre = £30 for both
const PRICING_DEFS = [
  { productCode: 'FL-100035', productName: 'Spicy Margarita',   volumeLitres: 5,  pricePerLitre: 30, rrp: 12 },
  { productCode: 'FL-300035', productName: 'Spicy Margarita',   volumeLitres: 19, pricePerLitre: 30, rrp: 12 },
  { productCode: 'FL-100036', productName: 'Olive Oil Negroni', volumeLitres: 5,  pricePerLitre: 30, rrp: 12 },
  { productCode: 'FL-300036', productName: 'Olive Oil Negroni', volumeLitres: 19, pricePerLitre: 30, rrp: 12 },
]

export async function GET() {
  const log: string[] = []

  try {
    // 1. Find Heard Borough account
    const accountSnap = await getDocs(
      query(collection(db, 'accounts'), where('tradingName', '==', 'Heard Borough'))
    )
    if (accountSnap.empty) {
      return NextResponse.json({ success: false, error: 'Heard Borough account not found' })
    }
    const account     = accountSnap.docs[0]
    const accountData = account.data() as Record<string, any>

    // 2. Delete any existing pricing for these products on Heard Borough
    const existingSnap = await getDocs(
      query(collection(db, 'accountPricing'), where('accountId', '==', account.id))
    )
    const targetCodes = new Set(PRICING_DEFS.map(d => d.productCode))
    const toDelete = existingSnap.docs.filter(d => targetCodes.has(d.data().productCode))

    for (const d of toDelete) {
      const { deleteDoc, doc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'accountPricing', d.id))
      log.push(`DELETED old pricing for ${d.data().productCode}`)
    }

    // 3. Look up product docs
    const productSnap = await getDocs(collection(db, 'products'))
    const productByCode = new Map(
      productSnap.docs.map(d => [d.data().productCode as string, { id: d.id, ...d.data() as any }])
    )

    // 4. Create fresh pricing entries
    for (const def of PRICING_DEFS) {
      const product = productByCode.get(def.productCode)
      if (!product) {
        log.push(`SKIP ${def.productCode} — product not found`)
        continue
      }

      const servingG     = product.recommendedServingG ?? 100
      const pricePerUnit = r2(def.pricePerLitre * def.volumeLitres)
      const vGp          = venueGp(def.rrp, pricePerUnit, def.volumeLitres, servingG)
      const fGp          = foodlabGp(pricePerUnit, product.costToMake ?? 0, def.volumeLitres, servingG)

      const entry: Record<string, any> = {
        accountId:          account.id,
        accountName:        'Heard Borough',
        productId:          product.id,
        productCode:        def.productCode,
        productName:        def.productName,
        volumeLitres:       def.volumeLitres,
        recommendedServingG:servingG,
        pricePerLitre:      def.pricePerLitre,
        pricePerUnit,
        rrp:                def.rrp,
        venueGpPercent:     vGp,
        foodlabGpPercent:   fGp,
        createdAt:          Timestamp.now(),
        updatedAt:          Timestamp.now(),
      }
      if (accountData.groupId)   entry.groupId   = accountData.groupId
      if (accountData.groupName) entry.groupName = accountData.groupName

      await addDoc(collection(db, 'accountPricing'), entry)
      log.push(
        `CREATED ${def.productCode} (${def.volumeLitres}L) — £${def.pricePerLitre}/L → £${pricePerUnit}/bag | Venue GP: ${vGp}% | Foodlab GP: ${fGp}%`
      )
    }

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}