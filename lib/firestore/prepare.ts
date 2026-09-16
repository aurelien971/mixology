import { Timestamp, deleteField } from 'firebase/firestore'

/**
 * Firestore rejects undefined anywhere, including inside nested lists. Dates
 * become Timestamps, undefined is dropped, null is kept.
 */
export function prepare(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (Array.isArray(value)) return value.map(prepare)
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = prepare(v)
    return out
  }
  return value
}

/** For updates: a top-level undefined means "clear this field". */
export function forUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) out[k] = v === undefined ? deleteField() : prepare(v)
  return out
}
