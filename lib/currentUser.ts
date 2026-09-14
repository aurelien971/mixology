import { ProjectUpdate } from '@/types'

/**
 * Who is signed in, read straight from the saved session.
 *
 * The update writers live outside React, so they cannot use the auth context —
 * but the session is in localStorage, and that is enough to put a name against
 * every change. Null on the server or when nobody is signed in.
 */
export function currentUserName(): string | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('foodlab_session')
    if (!raw) return null
    const u = JSON.parse(raw) as { displayName?: string; username?: string }
    return u.displayName || u.username || null
  } catch {
    return null
  }
}

/** Put the signed-in name on new log lines. Left untouched when nobody is. */
export function stampAuthor(entries: ProjectUpdate[]): ProjectUpdate[] {
  const who = currentUserName()
  // Firestore rejects undefined inside arrays, so never write `by: undefined`.
  return who ? entries.map((e) => (e.by ? e : { ...e, by: who })) : entries
}
