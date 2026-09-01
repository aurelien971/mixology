import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Project, ProjectUpdate } from '@/types'

const COLLECTION = 'projects'

function fromFirestore(id: string, data: Record<string, unknown>): Project {
  return {
    ...(data as Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'dueDate' | 'parkedUntil'>),
    id,
    dueDate: (data.dueDate as Timestamp)?.toDate(),
    parkedUntil: (data.parkedUntil as Timestamp)?.toDate(),
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
  }
}

// Firestore rejects `undefined`; inline edits clear fields by passing undefined,
// so strip them and let the field simply stay absent.
function clean<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    out[k] = v instanceof Date ? Timestamp.fromDate(v) : v
  }
  return out
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return fromFirestore(snap.id, snap.data())
}

export async function getProjects(): Promise<Project[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => fromFirestore(d.id, d.data()))
}

export async function createProject(
  data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...clean(data),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateProject(
  id: string,
  data: Partial<Omit<Project, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...clean(data),
    updatedAt: Timestamp.now(),
  })
}

export async function deleteProject(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

/**
 * Write a change and record it in the same breath.
 *
 * The update log is the point of the board — "what moved, and when" is the
 * question the weekly actually asks — so logging is part of saving rather than
 * something a caller has to remember.
 */
export async function updateProjectLogged(
  project: Project,
  data: Partial<Omit<Project, 'id' | 'createdAt'>>,
  note?: string
): Promise<ProjectUpdate[]> {
  const entries: ProjectUpdate[] = []
  const at = new Date().toISOString()

  if (note?.trim()) entries.push({ at, text: note.trim(), kind: 'note' })

  type Loggable = keyof Omit<Project, 'id' | 'createdAt'>
  const described: Partial<Record<Loggable, (v: unknown) => string>> = {
    stage:      (v) => `Stage → ${v}`,
    owner:      (v) => (v ? `Owner → ${v}` : 'Owner cleared'),
    dueDate:    (v) => (v ? `Due ${(v as Date).toLocaleDateString('en-GB')}` : 'Due date cleared'),
    blocker:    (v) => (v ? `Blocked: ${v}` : 'Blocker cleared'),
    decision:   (v) => (v === 'top' ? 'Picked for this month' : v === 'parked' ? 'Parked' : 'Unpicked'),
    nextStep:   (v) => (v ? `Next: ${v}` : 'Next step cleared'),
    effortDays: (v) => `Effort → ${v} days`,
    prizeGbp:   (v) => `Prize → £${v}`,
  }

  for (const [key, describe] of Object.entries(described) as [Loggable, (v: unknown) => string][]) {
    if (!(key in data)) continue
    const next = data[key]
    if (JSON.stringify(next ?? null) === JSON.stringify(project[key] ?? null)) continue
    entries.push({ at, text: describe(next), kind: 'auto' })
  }

  const updates = [...entries, ...(project.updates ?? [])].slice(0, 200)
  await updateProject(project.id, { ...data, updates })
  return updates
}
