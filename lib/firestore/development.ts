import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DevelopmentRecord, DevVariant, ProjectUpdate, Product, DEV_VARIANTS } from '@/types'

const COLLECTION = 'development'

function fromFirestore(id: string, data: Record<string, unknown>): DevelopmentRecord {
  return {
    ...(data as Omit<DevelopmentRecord, 'id' | 'createdAt' | 'updatedAt' | 'nextTasting'>),
    id,
    nextTasting: (data.nextTasting as Timestamp)?.toDate?.(),
    createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? new Date(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate?.() ?? new Date(),
  }
}

// Firestore rejects undefined; clearing a field means leaving it out.
function clean<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    out[k] = v instanceof Date ? Timestamp.fromDate(v) : v
  }
  return out
}

export async function getDevelopment(): Promise<DevelopmentRecord[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function createDevelopment(
  data: Omit<DevelopmentRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...clean(data),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDevelopment(
  id: string,
  data: Partial<Omit<DevelopmentRecord, 'id' | 'createdAt'>>
): Promise<void> {
  const patch = clean(data)
  await updateDoc(doc(db, COLLECTION, id), {
    ...patch,
    updatedAt: patch.updatedAt ?? Timestamp.now(),
  })
}

export async function deleteDevelopment(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

/**
 * Record the change and what it was in one write.
 *
 * The whole point of this board is being able to say what moved and when
 * months from now, so logging is part of saving rather than a separate habit.
 */
export async function updateDevelopmentLogged(
  record: DevelopmentRecord,
  data: Partial<Omit<DevelopmentRecord, 'id' | 'createdAt'>>,
  note?: string
): Promise<ProjectUpdate[]> {
  const at = new Date().toISOString()
  const entries: ProjectUpdate[] = []
  if (note?.trim()) entries.push({ at, text: note.trim(), kind: 'note' })

  type Loggable = keyof Omit<DevelopmentRecord, 'id' | 'createdAt'>
  const described: Partial<Record<Loggable, (v: unknown) => string>> = {
    stage:       (v) => `Stage → ${v}`,
    owner:       (v) => (v ? `Owner → ${v}` : 'Owner cleared'),
    nextTasting: (v) => (v ? `Tasting set for ${(v as Date).toLocaleDateString('en-GB')}` : 'Tasting date cleared'),
    blocker:     (v) => (v ? `Blocked: ${v}` : 'Blocker cleared'),
    nextStep:    (v) => (v ? `Next: ${v}` : 'Next step cleared'),
    recipeId:    () => 'Spec changed',
  }

  for (const [key, describe] of Object.entries(described) as [Loggable, (v: unknown) => string][]) {
    if (!(key in data)) continue
    const next = data[key]
    if (JSON.stringify(next ?? null) === JSON.stringify(record[key] ?? null)) continue
    entries.push({ at, text: describe(next), kind: 'auto' })
  }

  const updates = [...entries, ...(record.updates ?? [])].slice(0, 200)
  await updateDevelopment(record.id, { ...data, updates })
  return updates
}

/**
 * Every core classic gets a row per format, created once and never duplicated.
 * Adding a drink to the range is enough — the tracker fills itself in.
 */
export async function syncDevelopmentForRange(
  classics: Product[],
  existing: DevelopmentRecord[]
): Promise<number> {
  const have = new Set(existing.map((r) => `${r.productId}§${r.variant}`))
  let created = 0
  for (const p of classics) {
    for (const v of DEV_VARIANTS) {
      if (have.has(`${p.id}§${v.value}`)) continue
      await createDevelopment({
        productId: p.id,
        productName: p.name,
        variant: v.value as DevVariant,
        stage: 'not_started',
        updates: [{ at: new Date().toISOString(), text: 'Added to the rollout', kind: 'auto' }],
      })
      created++
    }
  }
  return created
}
