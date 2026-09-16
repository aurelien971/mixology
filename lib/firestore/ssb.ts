import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { SsbDrink, ProjectUpdate, SSB_STAGES } from '@/types'
import { stampAuthor } from '@/lib/currentUser'
import { prepare, forUpdate } from '@/lib/firestore/prepare'
import { SSB_SEED } from '@/lib/ssb'

const COLLECTION = 'ssbMenu'
const META_PATH = ['objectives', 'spring-street-bar'] as const

function fromFirestore(id: string, data: Record<string, unknown>): SsbDrink {
  const createdAt = (data.createdAt as Timestamp)?.toDate?.() ?? new Date()
  return {
    ...(data as Omit<SsbDrink, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt,
    updatedAt: (data.updatedAt as Timestamp)?.toDate?.() ?? createdAt,
  }
}

export async function getSsbDrinks(): Promise<SsbDrink[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => fromFirestore(d.id, d.data())).sort((a, b) => a.order - b.order)
}

/**
 * Put the menu in once. Only on an empty list, and each drink under a fixed
 * id, so opening the page twice at once cannot duplicate a drink and a drink
 * someone deletes later is not quietly brought back.
 */
export async function seedSsbMenuIfEmpty(): Promise<number> {
  const existing = await getDocs(collection(db, COLLECTION))
  if (!existing.empty) return 0
  const at = new Date().toISOString()
  let created = 0
  for (const s of SSB_SEED) {
    const ref = doc(db, COLLECTION, s.id)
    if ((await getDoc(ref)).exists()) continue
    await setDoc(ref, {
      ...(prepare({
        ...s,
        stage: 'to_review',
        cost: s.sheetCost,
        sale: s.sheetSale,
        updates: [{ at, text: 'On the menu Tom sent', kind: 'auto' }],
      }) as Record<string, unknown>),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    created++
  }
  return created
}

const money = (v: unknown) => `£${Number(v).toFixed(2)}`
const stageLabel = (v: unknown) => SSB_STAGES.find((s) => s.value === v)?.label ?? String(v)

/** Save a drink and log what changed, with the signed-in name on the line. */
export async function updateSsbDrinkLogged(
  drink: SsbDrink,
  data: Partial<Omit<SsbDrink, 'id' | 'createdAt'>>,
  note?: string,
  auto?: string
): Promise<ProjectUpdate[]> {
  const at = new Date().toISOString()
  const entries: ProjectUpdate[] = []
  if (note?.trim()) entries.push({ at, text: note.trim(), kind: 'note' })
  if (auto?.trim()) entries.push({ at, text: auto.trim(), kind: 'auto' })

  type Loggable = keyof Omit<SsbDrink, 'id' | 'createdAt'>
  const described: Partial<Record<Loggable, (v: unknown) => string>> = {
    stage:       (v) => `Step → ${stageLabel(v)}`,
    cost:        (v) => `Cost per serve ${money(drink.cost)} → ${money(v)}`,
    sale:        (v) => `Menu price ${money(drink.sale)} → ${money(v)}`,
    owner:       (v) => (v ? `Owner → ${v}` : 'Owner cleared'),
    nextStep:    (v) => (v ? `Next step: ${v}` : 'Next step cleared'),
    feedback:    (v) => (v ? `Their feedback: ${v}` : 'Feedback cleared'),
    classicName: (v) => (v ? `Matched to our ${v}` : 'No longer matched to a classic'),
  }
  for (const [key, describe] of Object.entries(described) as [Loggable, (v: unknown) => string][]) {
    if (!(key in data)) continue
    const next = data[key]
    if (JSON.stringify(next ?? null) === JSON.stringify(drink[key] ?? null)) continue
    entries.push({ at, text: describe(next), kind: 'auto' })
  }

  const updates = [...stampAuthor(entries), ...(drink.updates ?? [])].slice(0, 300)
  await updateDoc(doc(db, COLLECTION, drink.id), {
    ...forUpdate({ ...data, updates } as Record<string, unknown>),
    updatedAt: Timestamp.now(),
  })
  return updates
}

export interface SsbMeta { trialDate?: string; notes?: string }

export async function getSsbMeta(): Promise<SsbMeta> {
  const snap = await getDoc(doc(db, ...META_PATH))
  return snap.exists() ? (snap.data() as SsbMeta) : {}
}

export async function saveSsbMeta(data: SsbMeta): Promise<void> {
  await setDoc(doc(db, ...META_PATH), prepare(data) as Record<string, unknown>, { merge: true })
}
