import { NextResponse } from 'next/server'
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function GET() {
  const results = {
    products: { updated: 0, alreadyHadCode: 0 },
    orders: { updated: 0, alreadyOk: 0 },
    log: [] as string[],
  }

  try {
    // ── 1. Fix products missing productCode ──────────────────────────────────
    const productsSnap = await getDocs(collection(db, 'products'))
    const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() as Record<string, any> }))

    // Sort by name so codes are assigned alphabetically (consistent re-runs)
    const needsCodes = products
      .filter((p) => !p.productCode)
      .sort((a, b) => a.name.localeCompare(b.name))

    const alreadyHasCodes = products.filter((p) => p.productCode)
    results.products.alreadyHadCode = alreadyHasCodes.length

    // Find highest existing code number to continue from
    let maxCode = 100000
    for (const p of alreadyHasCodes) {
      const num = parseInt((p.productCode as string).replace('FL-', ''), 10)
      if (!isNaN(num) && num > maxCode) maxCode = num
    }

    if (needsCodes.length > 0) {
      const batch = writeBatch(db)
      let counter = maxCode + 1
      for (const product of needsCodes) {
        const code = `FL-${counter}`
        batch.update(doc(db, 'products', product.id), {
          productCode: code,
          updatedAt: Timestamp.now(),
        })
        results.log.push(`Product: "${product.name}" → ${code}`)
        counter++
        results.products.updated++
      }
      await batch.commit()
    }

    // ── 2. Build productId → code map for order backfill ─────────────────────
    // Re-fetch products now that codes are assigned
    const updatedProductsSnap = await getDocs(collection(db, 'products'))
    const productCodeMap: Record<string, string> = {}
    for (const d of updatedProductsSnap.docs) {
      const data = d.data() as Record<string, any>
      if (data.productCode) productCodeMap[d.id] = data.productCode
    }

    // ── 3. Fix order line items missing productCode ───────────────────────────
    const ordersSnap = await getDocs(collection(db, 'orders'))

    for (const orderDoc of ordersSnap.docs) {
      const data = orderDoc.data() as Record<string, any>
      const lineItems: any[] = data.lineItems ?? []

      const needsUpdate = lineItems.some((l) => !l.productCode)
      if (!needsUpdate) {
        results.orders.alreadyOk++
        continue
      }

      const updatedLines = lineItems.map((l) => ({
        ...l,
        productCode: l.productCode || productCodeMap[l.productId] || 'FL-UNKNOWN',
      }))

      await updateDoc(doc(db, 'orders', orderDoc.id), {
        lineItems: updatedLines,
        updatedAt: Timestamp.now(),
      })
      results.log.push(`Order ${data.orderNumber}: backfilled ${updatedLines.length} line item codes`)
      results.orders.updated++
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}