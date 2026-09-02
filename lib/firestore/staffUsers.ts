import { collection, doc, getDocs, query, where, addDoc, updateDoc, deleteDoc, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface StaffUser {
  id: string
  username: string       // lowercase, e.g. "dima"
  displayName: string    // e.g. "Dima"
  password: string       // plain text — acceptable for internal tool with private URL
  role: 'admin' | 'staff'
  createdAt: Date
}

export async function getStaffUser(username: string, password: string): Promise<StaffUser | null> {
  const q = query(
    collection(db, 'staffUsers'),
    where('username', '==', username.toLowerCase().trim()),
    where('password', '==', password)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  const data = d.data() as any
  return {
    id:          d.id,
    username:    data.username,
    displayName: data.displayName,
    password:    data.password,
    role:        data.role ?? 'staff',
    createdAt:   data.createdAt?.toDate(),
  }
}

export async function createStaffUser(
  username: string, displayName: string, password: string, role: 'admin' | 'staff' = 'staff'
): Promise<string> {
  const ref = await addDoc(collection(db, 'staffUsers'), {
    username: username.toLowerCase().trim(),
    displayName,
    password,
    role,
    createdAt: Timestamp.now(),
  })
  return ref.id
}
export async function getStaffUsers(): Promise<StaffUser[]> {
  const snap = await getDocs(query(collection(db, 'staffUsers'), orderBy('displayName')))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      username: String(data.username ?? ''),
      displayName: String(data.displayName ?? data.username ?? ''),
      password: String(data.password ?? ''),
      role: data.role === 'admin' ? 'admin' : 'staff',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    }
  })
}

export async function updateStaffUser(
  id: string,
  data: Partial<Pick<StaffUser, 'displayName' | 'password' | 'role'>>
): Promise<void> {
  await updateDoc(doc(db, 'staffUsers', id), data)
}

export async function deleteStaffUser(id: string): Promise<void> {
  await deleteDoc(doc(db, 'staffUsers', id))
}

/** Usernames are the login key, so a duplicate would make one account unreachable. */
export async function usernameTaken(username: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'staffUsers'), where('username', '==', username.toLowerCase().trim()))
  )
  return !snap.empty
}
