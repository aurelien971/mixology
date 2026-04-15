import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Group } from '@/types'

const COLLECTION = 'groups'

function fromFirestore(id: string, data: Record<string, unknown>): Group {
  return {
    ...(data as Omit<Group, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
  }
}

export async function getGroups(): Promise<Group[]> {
  const q = query(collection(db, COLLECTION), orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function getGroup(id: string): Promise<Group | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return fromFirestore(snap.id, snap.data())
}

export async function createGroup(
  data: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateGroup(
  id: string,
  data: Partial<Omit<Group, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: Timestamp.now(),
  })
}