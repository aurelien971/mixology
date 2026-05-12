import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

function generateToken(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function GET() {
  const log: string[] = []
  let updated = 0

  try {
    const snap = await getDocs(collection(db, 'accounts'))
    for (const d of snap.docs) {
      const data = d.data() as any
      if (data.clientToken) {
        log.push(`SKIP  ${data.tradingName} — already has token`)
        continue
      }
      const token = generateToken()
      await updateDoc(d.ref, { clientToken: token, updatedAt: Timestamp.now() })
      log.push(`DONE  ${data.tradingName} → ${token}`)
      updated++
    }
    return NextResponse.json({ success: true, updated, log })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}