import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteField, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { RolloutVenue, ProjectUpdate, ROLLOUT_STEPS, ROLLOUT_OFF_ROAD } from '@/types'
import { stampAuthor } from '@/lib/currentUser'

const COLLECTION = 'rollouts'

function toDate(v: unknown): Date | undefined {
  return (v as Timestamp)?.toDate?.()
}

function fromFirestore(id: string, data: Record<string, unknown>): RolloutVenue {
  const createdAt = toDate(data.createdAt) ?? new Date()
  return {
    ...(data as Omit<RolloutVenue, 'id' | 'nextStepDue' | 'startedAt' | 'createdAt' | 'updatedAt'>),
    id,
    nextStepDue: toDate(data.nextStepDue),
    startedAt: toDate(data.startedAt) ?? createdAt,
    createdAt,
    updatedAt: toDate(data.updatedAt) ?? createdAt,
  }
}

// Firestore rejects undefined anywhere, including inside the contact and drink
// lists. Nested undefined is dropped; a top-level undefined means "clear this
// field", which has to be said with deleteField().
function prepare(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (Array.isArray(value)) return value.map(prepare)
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = prepare(v)
    return out
  }
  return value
}

function forUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) out[k] = v === undefined ? deleteField() : prepare(v)
  return out
}

export async function getRollouts(): Promise<RolloutVenue[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

/**
 * One record per venue, stored under the account's own id. Two people opening
 * the board at the same moment both write to the same document, so a venue can
 * never end up on the board twice — and an existing record is never reset.
 */
export async function createRollout(
  data: Omit<RolloutVenue, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = doc(db, COLLECTION, data.accountId)
  if ((await getDoc(ref)).exists()) return ref.id
  await setDoc(ref, {
    ...(prepare(data) as Record<string, unknown>),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateRollout(
  id: string,
  data: Partial<Omit<RolloutVenue, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...forUpdate(data as Record<string, unknown>),
    updatedAt: Timestamp.now(),
  })
}

const stageLabel = (v: unknown) =>
  [...ROLLOUT_STEPS, ...ROLLOUT_OFF_ROAD].find((s) => s.value === v)?.label ?? String(v)

/**
 * Save and log in one write, with the signed-in name on the log line.
 * `auto` is for changes a field diff describes badly — "Negroni: Yes".
 */
export async function updateRolloutLogged(
  venue: RolloutVenue,
  data: Partial<Omit<RolloutVenue, 'id' | 'createdAt'>>,
  note?: string,
  auto?: string
): Promise<ProjectUpdate[]> {
  const at = new Date().toISOString()
  const entries: ProjectUpdate[] = []
  if (note?.trim()) entries.push({ at, text: note.trim(), kind: 'note' })
  if (auto?.trim()) entries.push({ at, text: auto.trim(), kind: 'auto' })

  type Loggable = keyof Omit<RolloutVenue, 'id' | 'createdAt'>
  const described: Partial<Record<Loggable, (v: unknown) => string>> = {
    stage:       (v) => `Step → ${stageLabel(v)}`,
    owner:       (v) => (v ? `Owner → ${v}` : 'Owner cleared'),
    nextStep:    (v) => (v ? `Next step: ${v}` : 'Next step cleared'),
    nextStepDue: (v) => (v ? `Next step due ${(v as Date).toLocaleDateString('en-GB')}` : 'Due date cleared'),
    blocker:     (v) => (v ? `Blocked: ${v}` : 'Blocker cleared'),
  }
  for (const [key, describe] of Object.entries(described) as [Loggable, (v: unknown) => string][]) {
    if (!(key in data)) continue
    const next = data[key]
    if (JSON.stringify(next ?? null) === JSON.stringify(venue[key] ?? null)) continue
    entries.push({ at, text: describe(next), kind: 'auto' })
  }

  const updates = [...stampAuthor(entries), ...(venue.updates ?? [])].slice(0, 300)
  await updateRollout(venue.id, { ...data, updates })
  return updates
}
