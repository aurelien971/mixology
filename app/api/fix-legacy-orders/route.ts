import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * One-time migration for orders created before the 5L bag format change.
 * 
 * OLD format: quantity = litres (e.g. quantity=38 means 38 litres)
 * NEW format: quantity = number of bags, volumeLitres set per line item
 * 
 * Detection: if ANY line item has no volumeLitres field → legacy order.
 * Fix: set volumeLitres=1 on all line items so quantity × volumeLitres = litres.
 * 
 * New orders already have volumeLitres set → untouched.
 */
export async function GET() {
  const log: string[] = []
  let fixed = 0
  let skipped = 0

  try {
    const snap = await getDocs(collection(db, 'orders'))

    for (const d of snap.docs) {
      const data = d.data() as Record<string, any>
      const lineItems: any[] = data.lineItems ?? []

      // If all line items already have volumeLitres → new format, skip
      const isLegacy = lineItems.some(l => l.volumeLitres === undefined || l.volumeLitres === null)

      if (!isLegacy) {
        skipped++
        log.push(`SKIP  ${data.orderNumber} — already has volumeLitres on all lines`)
        continue
      }

      // Patch: set volumeLitres=1 on every line so quantity is treated as litres
      const patchedLines = lineItems.map(l => ({
        ...l,
        volumeLitres: l.volumeLitres ?? 1,
      }))

      await updateDoc(d.ref, {
        lineItems: patchedLines,
        updatedAt: Timestamp.now(),
      })

      const totalL = patchedLines.reduce((s: number, l: any) => s + l.quantity * l.volumeLitres, 0)
      log.push(`FIXED ${data.orderNumber} (${data.accountName}) — ${patchedLines.length} lines, ${totalL}L total`)
      fixed++
    }

    return NextResponse.json({
      success: true,
      summary: { fixed, skipped, total: fixed + skipped },
      log,
      note: 'Legacy orders now have volumeLitres=1 per line item. Finance COGS will now calculate correctly.',
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}