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
  limit,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Order, OrderStatus } from '@/types'

const COLLECTION = 'orders'

function fromFirestore(id: string, data: Record<string, unknown>): Order {
  return {
    ...(data as Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'deliveryDate' | 'expectedDeliveryDate'>),
    id,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
    deliveryDate: data.deliveryDate
      ? (data.deliveryDate as Timestamp).toDate()
      : undefined,
    expectedDeliveryDate: data.expectedDeliveryDate
      ? (data.expectedDeliveryDate as Timestamp).toDate()
      : undefined,
  }
}

export async function getOrders(limitCount = 100): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function getOrdersByAccount(accountId: string): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    where('accountId', '==', accountId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function getOrder(id: string): Promise<Order | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return fromFirestore(snap.id, snap.data())
}

export async function createOrder(
  data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  extra?: Partial<Order>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status,
    ...extra,
    updatedAt: Timestamp.now(),
  })
}

export async function updateOrder(
  id: string,
  data: Partial<Omit<Order, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: Timestamp.now(),
  })
}

export async function generateOrderNumber(): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const q = query(
    collection(db, COLLECTION),
    where('orderNumber', '>=', `FL-${year}-`),
    where('orderNumber', '<', `FL-${year + 1}-`),
    orderBy('orderNumber', 'desc'),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return `FL-${year}-0001`
  const last = snap.docs[0].data().orderNumber as string
  const lastNum = parseInt(last.split('-')[2], 10)
  return `FL-${year}-${String(lastNum + 1).padStart(4, '0')}`
}