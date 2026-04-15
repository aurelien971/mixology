import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const updates: Record<string, { email: string; address: { line1: string; city: string; postcode: string } }> = {
  'Pyro': {
    email: 'ruhit@pyrolondon.co.uk',
    address: { line1: '53b Southwark St', city: 'London', postcode: 'SE1 1RU' },
  },
  'Heard Soho': {
    email: 'arturo@heardburger.co.uk',
    address: { line1: "31 Foubert's Place", city: 'London', postcode: 'W1F 7QG' },
  },
  'Heard Borough': {
    email: 'attila@heardburger.co.uk',
    address: { line1: '1 Flat Iron Square', city: 'London', postcode: 'SE1 0AB' },
  },
  'Spring Street Pizza': {
    email: 'alessia@springstpizza.com',
    address: { line1: 'Arch 32, Southwark Quarter, Southwark St', city: 'London', postcode: 'SE1 1TE' },
  },
  'Oudh 1722': {
    email: 'ben.kussan@oudh1722.com',
    address: { line1: '66 Union St', city: 'London', postcode: 'SE1 1TD' },
  },
}

export async function GET() {
  const results: string[] = []
  let updated = 0

  try {
    for (const [tradingName, data] of Object.entries(updates)) {
      const q = query(collection(db, 'accounts'), where('tradingName', '==', tradingName))
      const snap = await getDocs(q)

      if (snap.empty) {
        results.push(`⚠ Not found: ${tradingName}`)
        continue
      }

      await updateDoc(snap.docs[0].ref, {
        email:      data.email,
        address:    data.address,
        updatedAt:  Timestamp.now(),
      })
      results.push(`✓ Updated: ${tradingName} → ${data.email} · ${data.address.line1}, ${data.address.postcode}`)
      updated++
    }

    return NextResponse.json({ success: true, updated, results })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}