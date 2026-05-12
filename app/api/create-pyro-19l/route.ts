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
  const costPerBag     = costToMake * servingsPerBag
  return r2(((pricePerUnit - costPerBag) / pricePerUnit) * 100)
}

// ── From the Pyro price list PDF ──────────────────────────────────────────────
// pricePerLitre = pricePerBag(5L) / 5
// RRP taken from the same PDF
const PRODUCTS_19L = [
  { base5LCode: 'FL-100009', code19L: 'FL-300009', name: 'Aegeas G+T',            servingG: 120, ppl: 21.12, rrp: 12.00 },
  { base5LCode: 'FL-100010', code19L: 'FL-300010', name: 'Peach & Scotch Soda',   servingG: 120, ppl: 23.08, rrp: 12.00 },
  { base5LCode: 'FL-100011', code19L: 'FL-300011', name: 'Pyro Aperol Spritz',    servingG: 120, ppl: 21.08, rrp: 13.00 },
  { base5LCode: 'FL-100012', code19L: 'FL-300012', name: 'Thyme & Pomegranate',   servingG: 120, ppl: 22.04, rrp: 12.00 },
  { base5LCode: 'FL-100013', code19L: 'FL-300013', name: 'Melon & Lemon Verbena', servingG: 120, ppl: 21.18, rrp: 12.00 },
  { base5LCode: 'FL-100014', code19L: 'FL-300014', name: 'Mountain Ice Tea',      servingG: 120, ppl: 21.58, rrp: 12.00 },
]

export async function GET() {
  const log: string[] = []
  let productsCreated = 0
  let pricingCreated  = 0

  try {
    // ── 1. Find Pyro account ──────────────────────────────────────────────────
    const accountSnap = await getDocs(
      query(collection(db, 'accounts'), where('tradingName', '==', 'Pyro'))
    )
    if (accountSnap.empty) {
      return NextResponse.json({ success: false, error: 'Pyro account not found' })
    }
    const pyroAccount     = accountSnap.docs[0]
    const pyroAccountData = pyroAccount.data() as Record<string, any>
    log.push(`Found account: Pyro (${pyroAccount.id})`)

    for (const def of PRODUCTS_19L) {
      // ── 2. Get base 5L product for costToMake etc ─────────────────────────
      const base5LSnap = await getDocs(
        query(collection(db, 'products'), where('productCode', '==', def.base5LCode))
      )
      if (base5LSnap.empty) {
        log.push(`SKIP — base product ${def.base5LCode} not found`)
        continue
      }
      const base5L = base5LSnap.docs[0].data() as Record<string, any>

      // ── 3. Check 19L product doesn't already exist ────────────────────────
      const existing19L = await getDocs(
        query(collection(db, 'products'), where('productCode', '==', def.code19L))
      )
      let product19LId: string

      if (!existing19L.empty) {
        product19LId = existing19L.docs[0].id
        log.push(`EXISTS  ${def.code19L} — ${def.name} 19L (skipping creation)`)
      } else {
        // ── 4. Create 19L product doc ───────────────────────────────────────
        const newProduct: Record<string, any> = {
          productCode:         def.code19L,
          baseCode:            def.base5LCode,
          name:                def.name,
          category:            base5L.category ?? 'Cocktail',
          costToMake:          base5L.costToMake ?? 0,
          costMissing:         base5L.costMissing ?? (base5L.costToMake === 0),
          recommendedServingG: def.servingG,
          volumeLitres:        19,
          isNonAlcoholic:      base5L.isNonAlcoholic ?? false,
          isCoreRange:         base5L.isCoreRange ?? false,
          isActive:            true,
          createdAt:           Timestamp.now(),
          updatedAt:           Timestamp.now(),
        }
        if (base5L.servingNotes) newProduct.servingNotes = base5L.servingNotes

        const ref = await addDoc(collection(db, 'products'), newProduct)
        product19LId = ref.id
        log.push(`CREATED ${def.code19L} — ${def.name} 19L`)
        productsCreated++
      }

      // ── 5. Check pricing doesn't already exist for Pyro ──────────────────
      const existingPricing = await getDocs(
        query(
          collection(db, 'accountPricing'),
          where('accountId', '==', pyroAccount.id),
          where('productCode', '==', def.code19L)
        )
      )
      if (!existingPricing.empty) {
        log.push(`PRICING EXISTS — ${def.code19L} for Pyro, skipping`)
        continue
      }

      // ── 6. Create pricing entry ───────────────────────────────────────────
      const pricePerUnit = r2(def.ppl * 19)
      const costToMake   = base5L.costToMake ?? 0

      const pricing: Record<string, any> = {
        accountId:          pyroAccount.id,
        accountName:        'Pyro',
        productId:          product19LId,
        productCode:        def.code19L,
        productName:        def.name,
        volumeLitres:       19,
        recommendedServingG:def.servingG,
        pricePerLitre:      def.ppl,
        pricePerUnit,
        rrp:                def.rrp,
        venueGpPercent:     venueGp(def.rrp, pricePerUnit, 19, def.servingG),
        foodlabGpPercent:   foodlabGp(pricePerUnit, costToMake, 19, def.servingG),
        createdAt:          Timestamp.now(),
        updatedAt:          Timestamp.now(),
      }
      if (pyroAccountData.groupId)   pricing.groupId   = pyroAccountData.groupId
      if (pyroAccountData.groupName) pricing.groupName = pyroAccountData.groupName

      await addDoc(collection(db, 'accountPricing'), pricing)
      log.push(
        `PRICING  ${def.code19L} — £${def.ppl}/L × 19 = £${pricePerUnit}/keg | Venue GP: ${pricing.venueGpPercent}%`
      )
      pricingCreated++
    }

    return NextResponse.json({
      success: true,
      counts: { productsCreated, pricingCreated },
      log,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}