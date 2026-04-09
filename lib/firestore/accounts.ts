import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Account } from '@/types'

const COL = 'accounts'

function fromFirestore(id: string, data: Record<string, unknown>): Account {
  return {
    ...data,
    id,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
  } as Account
}

export async function getAccounts(): Promise<Account[]> {
  const q = query(collection(db, COL), orderBy('legalName'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function getAccount(id: string): Promise<Account | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return fromFirestore(snap.id, snap.data())
}

export async function createAccount(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Timestamp.now()
  const ref = await addDoc(collection(db, COL), { ...data, createdAt: now, updatedAt: now })
  return ref.id
}

export async function updateAccount(id: string, data: Partial<Account>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: Timestamp.now() })
}

export async function deleteAccount(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}