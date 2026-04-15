import { NextResponse } from 'next/server'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const STAFF = [
  { username: 'dima',     displayName: 'Dima',     role: 'admin' },
  { username: 'aurelien', displayName: 'Aurelien', role: 'admin' },
]

const DEFAULT_PASSWORD = 'foodlab123'

export async function GET() {
  try {
    const existing = await getDocs(collection(db, 'staffUsers'))
    if (!existing.empty) {
      return NextResponse.json({
        success: false,
        message: `Already seeded — ${existing.size} staff users exist. Delete the staffUsers collection to re-seed.`,
      })
    }

    const created: string[] = []
    for (const user of STAFF) {
      await addDoc(collection(db, 'staffUsers'), {
        ...user,
        password:  DEFAULT_PASSWORD,
        createdAt: Timestamp.now(),
      })
      created.push(`${user.displayName} (${user.username})`)
    }

    return NextResponse.json({
      success: true,
      message: `Created ${created.length} staff users. Password: ${DEFAULT_PASSWORD}`,
      users: created,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}