import { NextResponse } from 'next/server'
import { collection, getDocs, addDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Creates (or repairs) the given staff users, then verifies each one by running
// THE EXACT SAME QUERY the login page uses. Open in a browser:
//   /api/create-staff
const USERS = [
  { username: 'mark',   displayName: 'Mark',   role: 'staff' },
  { username: 'edward', displayName: 'Edward', role: 'staff' },
]
const PASSWORD = 'foodlab123'

export async function GET() {
  const report: Record<string, unknown>[] = []
  try {
    for (const u of USERS) {
      const entry: Record<string, unknown> = { username: u.username }

      // Find ANY existing docs for this username (including broken ones with stray
      // whitespace or wrong casing — scan the whole collection to catch those)
      const all = await getDocs(collection(db, 'staffUsers'))
      const matches = all.docs.filter(d => {
        const uname = d.data().username
        return typeof uname === 'string' && uname.trim().toLowerCase() === u.username
      })

      if (matches.length > 0) {
        // Repair in place: exact lowercase username, exact string password, role, displayName
        for (const d of matches) {
          await updateDoc(d.ref, {
            username: u.username,
            displayName: u.displayName,
            password: PASSWORD,
            role: d.data().role === 'admin' ? 'admin' : u.role,
          })
        }
        entry.action = `repaired ${matches.length} existing doc${matches.length !== 1 ? 's' : ''}`
      } else {
        await addDoc(collection(db, 'staffUsers'), {
          username: u.username,
          displayName: u.displayName,
          password: PASSWORD,
          role: u.role,
          createdAt: Timestamp.now(),
        })
        entry.action = 'created'
      }

      // VERIFY — identical to getStaffUser() in lib/firestore/staffUsers.ts
      const check = await getDocs(query(
        collection(db, 'staffUsers'),
        where('username', '==', u.username),
        where('password', '==', PASSWORD),
      ))
      entry.loginQueryWorks = !check.empty
      report.push(entry)
    }

    const allGood = report.every(r => r.loginQueryWorks === true)
    return NextResponse.json({
      success: allGood,
      message: allGood
        ? `Both users verified — sign in with username "mark" or "edward", password "${PASSWORD}"`
        : 'Something is still wrong — see report',
      report,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error), report }, { status: 500 })
  }
}
