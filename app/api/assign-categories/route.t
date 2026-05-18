import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Rules:
// - type === 'rd' && rdAssignee contains 'majken' (case insensitive) → wine_consulting
// - type === 'rd' && rdAssignee contains 'dima'                      → cocktail_rd
// - type === 'rd' (any other assignee)                               → cocktail_rd
// - regular order (no type or type === 'order')                      → cocktail_production

export async function GET() {
  const log: string[] = []
  let updated = 0

  try {
    const snap = await getDocs(collection(db, 'orders'))

    for (const d of snap.docs) {
      const data = d.data() as any

      // Already has category — skip
      if (data.category) {
        log.push(`SKIP  ${data.orderNumber} — already has category: ${data.category}`)
        continue
      }

      let category = 'cocktail_production'

      if (data.type === 'rd') {
        const assignee = (data.rdAssignee ?? '').toLowerCase()
        if (assignee.includes('majken')) {
          category = 'wine_consulting'
        } else {
          category = 'cocktail_rd'
        }
      }

      await updateDoc(d.ref, { category, updatedAt: Timestamp.now() })
      log.push(`SET   ${data.orderNumber} (${data.accountName}) → ${category}`)
      updated++
    }

    return NextResponse.json({ success: true, updated, log })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}