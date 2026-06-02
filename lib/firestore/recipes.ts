import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Recipe } from '@/types'

const COL = 'recipes'

function toRecipe(id: string, d: any): Recipe {
  return {
    ...d,
    id,
    createdAt: d.createdAt?.toDate?.() ?? new Date(),
    updatedAt: d.updatedAt?.toDate?.() ?? new Date(),
  }
}

export async function getRecipes(): Promise<Recipe[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')))
  return snap.docs.map(d => toRecipe(d.id, d.data()))
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const snap = await getDoc(doc(db, COL, id))
  return snap.exists() ? toRecipe(snap.id, snap.data()) : null
}

export async function createRecipe(data: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateRecipe(id: string, data: Partial<Recipe>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: Timestamp.now() })
}

export async function deleteRecipe(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}