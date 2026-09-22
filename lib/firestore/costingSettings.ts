import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** What labour and packaging cost us — the inputs behind the batch projection. */
export interface CostingSettings {
  dimaSalary: number        // £ a year
  dimaHoursPerWeek: number
  edwardRate: number        // £ an hour
  batchLitres: number       // the batch we plan at
  bag20Price: number        // £ per 20L bag, ex VAT (box included free)
  bag5Price: number         // £ per 5L high-ABV bag, ex VAT (box included free)
  packFormat: '20' | '5'    // which bag the projection packs into
}

// Bag prices: The Bag In Box Shop UK, INV-3556, 24 Aug 2026 (boxes at £0).
export const DEFAULT_COSTING: CostingSettings = {
  dimaSalary: 45000,
  dimaHoursPerWeek: 40,
  edwardRate: 15,
  batchLitres: 150,
  bag20Price: 4.2,
  bag5Price: 1.95,
  packFormat: '20',
}

const REF = () => doc(db, 'settings', 'costing')

export async function getCostingSettings(): Promise<CostingSettings> {
  const snap = await getDoc(REF())
  return { ...DEFAULT_COSTING, ...(snap.exists() ? (snap.data() as Partial<CostingSettings>) : {}) }
}

export async function saveCostingSettings(data: Partial<CostingSettings>): Promise<void> {
  await setDoc(REF(), { ...data, updatedAt: Timestamp.now() }, { merge: true })
}
