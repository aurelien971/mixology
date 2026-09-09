import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { TastingSession, ProjectUpdate, TASTING_STAGES } from '@/types'

const COLLECTION = 'tastings'

function fromFirestore(id: string, data: Record<string, unknown>): TastingSession {
  return {
    ...(data as Omit<TastingSession, 'id' | 'createdAt' | 'updatedAt' | 'scheduledAt'>),
    id,
    items: (data.items as TastingSession['items']) ?? [],
    scheduledAt: (data.scheduledAt as Timestamp)?.toDate?.(),
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

export async function getTastings(): Promise<TastingSession[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function createTasting(
  data: Omit<TastingSession, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...clean(data),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateTasting(
  id: string,
  data: Partial<Omit<TastingSession, 'id' | 'createdAt'>>
): Promise<void> {
  const patch = clean(data)
  await updateDoc(doc(db, COLLECTION, id), {
    ...patch,
    updatedAt: patch.updatedAt ?? Timestamp.now(),
  })
}

export async function deleteTasting(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

/**
 * Save the change and what it was together.
 *
 * A tasting is the one meeting everyone remembers differently afterwards, so
 * the record of what moved is written at the same moment as the move.
 */
export async function updateTastingLogged(
  session: TastingSession,
  data: Partial<Omit<TastingSession, 'id' | 'createdAt'>>,
  note?: string
): Promise<ProjectUpdate[]> {
  const at = new Date().toISOString()
  const entries: ProjectUpdate[] = []
  if (note?.trim()) entries.push({ at, text: note.trim(), kind: 'note' })

  type Loggable = keyof Omit<TastingSession, 'id' | 'createdAt'>
  const described: Partial<Record<Loggable, (v: unknown) => string>> = {
    stage:       (v) => `Stage → ${TASTING_STAGES.find((s) => s.value === v)?.label ?? v}`,
    scheduledAt: (v) => (v ? `Set for ${(v as Date).toLocaleDateString('en-GB')}` : 'Date cleared'),
    owner:       (v) => (v ? `Owner → ${v}` : 'Owner cleared'),
    location:    (v) => (v ? `Where: ${v}` : 'Location cleared'),
    contact:     (v) => (v ? `Contact: ${v}` : 'Contact cleared'),
    nextStep:    (v) => (v ? `Next: ${v}` : 'Next step cleared'),
    items:       (v) => `Pour list → ${(v as TastingSession['items']).length} cocktails`,
  }

  for (const [key, describe] of Object.entries(described) as [Loggable, (v: unknown) => string][]) {
    if (!(key in data)) continue
    const next = data[key]
    if (JSON.stringify(next ?? null) === JSON.stringify(session[key] ?? null)) continue
    entries.push({ at, text: describe(next), kind: 'auto' })
  }

  const updates = [...entries, ...(session.updates ?? [])].slice(0, 200)
  await updateTasting(session.id, { ...data, updates })
  return updates
}
