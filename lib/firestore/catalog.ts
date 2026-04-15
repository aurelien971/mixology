import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Product, AccountPricing } from '@/types'

const PRODUCTS = 'products'
const PRICING = 'accountPricing'

function productFromFirestore(id: string, data: Record<string, unknown>): Product {
  return {
    ...(data as Omit<Product, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
  }
}

function pricingFromFirestore(id: string, data: Record<string, unknown>): AccountPricing {
  return {
    ...(data as Omit<AccountPricing, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
  }
}

// ── Products ──────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  const q = query(collection(db, PRODUCTS), orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => productFromFirestore(d.id, d.data()))
}

export async function getProduct(id: string): Promise<Product | null> {
  const snap = await getDoc(doc(db, PRODUCTS, id))
  if (!snap.exists()) return null
  return productFromFirestore(snap.id, snap.data())
}

export async function createProduct(
  data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, PRODUCTS), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, PRODUCTS, id), {
    ...data,
    updatedAt: Timestamp.now(),
  })
}

// ── Per-account pricing ───────────────────────────────────

export async function getPricingForAccount(accountId: string): Promise<AccountPricing[]> {
  const q = query(
    collection(db, PRICING),
    where('accountId', '==', accountId),
    orderBy('productName')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => pricingFromFirestore(d.id, d.data()))
}

export async function getPricingByGroup(groupId: string): Promise<AccountPricing[]> {
  const q = query(
    collection(db, PRICING),
    where('groupId', '==', groupId),
    orderBy('accountName'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => pricingFromFirestore(d.id, d.data()))
}

export async function upsertAccountPricing(
  pricing: Omit<AccountPricing, 'id' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const pricePerLitre = pricing.recommendedServingG > 0
    ? Math.round((pricing.pricePerUnit / pricing.recommendedServingG) * 1000 * 100) / 100
    : 0

  // GP uses ex-VAT RRP — venue's real margin after handing 20% VAT to HMRC
  const rrpExVat = pricing.rrp / 1.2
  const venueGpPercent = rrpExVat > 0
    ? Math.round(((rrpExVat - pricing.pricePerUnit) / rrpExVat) * 10000) / 100
    : pricing.venueGpPercent

  const data = { ...pricing, pricePerLitre, venueGpPercent }

  const q = query(
    collection(db, PRICING),
    where('accountId', '==', pricing.accountId),
    where('productId', '==', pricing.productId)
  )
  const snap = await getDocs(q)
  if (snap.empty) {
    await addDoc(collection(db, PRICING), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  } else {
    await updateDoc(snap.docs[0].ref, {
      ...data,
      updatedAt: Timestamp.now(),
    })
  }
}

export async function deleteAccountPricing(id: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, PRICING, id))
}