import { collection, doc, getDocs, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { RecipeDraftDoc } from '@/types'

const COL = 'recipeDrafts'

export async function getRecipeDrafts(): Promise<RecipeDraftDoc[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('confidence', 'desc')))
  return snap.docs.map(d => {
    const data = d.data()
    return {
      ...data,
      id: d.id,
      createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? new Date(),
    } as RecipeDraftDoc
  })
}

export async function deleteRecipeDraft(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
