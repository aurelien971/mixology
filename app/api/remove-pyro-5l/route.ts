import { NextResponse } from 'next/server'
import { collection, getDocs, deleteDoc, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// These 6 are now 19L kegs only for Pyro — remove the 5L pricing entries
const CODES_TO_REMOVE = [
  'FL-100009', // Aegeas G+T
  'FL-100010', // Peach & Scotch Soda
  'FL-100011', // Pyro Aperol Spritz
  'FL-100012', // Thyme & Pomegranate
  'FL-100013', // Melon & Lemon Verbena
  'FL-100014', // Mountain Ice Tea
]

export async function GET() {
  const log: string[] = []
  let removed = 0

  try {
    // Find Pyro account
    const accountSnap = await getDocs(
      query(collection(db, 'accounts'), where('tradingName', '==', 'Pyro'))
    )
    if (accountSnap.empty) {
      return NextResponse.json({ success: false, error: 'Pyro account not found' })
    }
    const pyroId = accountSnap.docs[0].id
    log.push(`Found Pyro (${pyroId})`)

    // Find and delete the 5L pricing entries
    for (const code of CODES_TO_REMOVE) {
      const snap = await getDocs(
        query(
          collection(db, 'accountPricing'),
          where('accountId', '==', pyroId),
          where('productCode', '==', code)
        )
      )
      if (snap.empty) {
        log.push(`NOT FOUND — ${code} pricing for Pyro (already removed?)`)
        continue
      }
      for (const d of snap.docs) {
        const data = d.data() as any
        await deleteDoc(d.ref)
        log.push(`REMOVED — ${code} (${data.productName}) 5L pricing from Pyro`)
        removed++
      }
    }

    return NextResponse.json({ success: true, removed, log })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}