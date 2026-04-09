import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Product, AccountPricing } from '@/types'

function fromFirestore(id: string, data: Record<string, unknown>): Product {
  return {
    ...data,
    id,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
  } as Product
}

export async function getProducts(): Promise<Product[]> {
  const q = query(collection(db, 'products'), orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Timestamp.now()
  const ref = await addDoc(collection(db, 'products'), { ...data, createdAt: now, updatedAt: now })
  return ref.id
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<void> {
  await updateDoc(doc(db, 'products', id), { ...data, updatedAt: Timestamp.now() })
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, 'products', id))
}

export async function getAccountPricing(accountId: string): Promise<AccountPricing[]> {
  const q = query(collection(db, 'accountPricing'), where('accountId', '==', accountId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AccountPricing))
}

export async function upsertAccountPricing(data: Omit<AccountPricing, 'id'>): Promise<void> {
  const q = query(
    collection(db, 'accountPricing'),
    where('accountId', '==', data.accountId),
    where('productId', '==', data.productId)
  )
  const snap = await getDocs(q)
  if (snap.empty) {
    await addDoc(collection(db, 'accountPricing'), data)
  } else {
    await updateDoc(snap.docs[0].ref, data)
  }
}