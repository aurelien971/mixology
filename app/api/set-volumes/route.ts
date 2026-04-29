import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// These two Heard products are individual-serve only — keep at 1L
const SINGLE_SERVE_NAMES = [
  'Spicy Margarita',
  'Olive Oil Negroni',
]

export async function GET() {
  try {
    const snap = await getDocs(collection(db, 'products'))
    const results: string[] = []
    let updated = 0

    for (const d of snap.docs) {
      const data = d.data() as Record<string, any>
      const name: string = data.name ?? ''

      const isSingleServe = SINGLE_SERVE_NAMES.some(n =>
        name.toLowerCase() === n.toLowerCase()
      )

      const volumes = isSingleServe ? [1] : [5, 10]

      await updateDoc(d.ref, {
        availableVolumes: volumes,
        updatedAt: Timestamp.now(),
      })

      results.push(`${name} → [${volumes.join(', ')}]L`)
      updated++
    }

    return NextResponse.json({
      success: true,
      updated,
      results,
      message: `Set volumes on ${updated} products. Single-serve: ${SINGLE_SERVE_NAMES.join(', ')} → [1L]. All others → [5L, 10L].`,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}