import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Payment, PaymentStatus } from '@/types'

const COL = 'payments'

function fromFirestore(id: string, data: Record<string, unknown>): Payment {
  return {
    ...data,
    id,
    dueDate: (data.dueDate as Timestamp)?.toDate(),
    paidAt: data.paidAt ? (data.paidAt as Timestamp).toDate() : undefined,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
  } as Payment
}

export async function getPayments(): Promise<Payment[]> {
  const q = query(collection(db, COL), orderBy('dueDate', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function getPaymentsByAccount(accountId: string): Promise<Payment[]> {
  const q = query(collection(db, COL), where('accountId', '==', accountId), orderBy('dueDate', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function createPayment(data: Omit<Payment, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...data, createdAt: Timestamp.now() })
  return ref.id
}

export async function markPaymentPaid(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: 'paid' as PaymentStatus,
    paidAt: Timestamp.now(),
  })
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<void> {
  await updateDoc(doc(db, COL, id), { status })
}