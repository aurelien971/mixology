import { NextResponse } from 'next/server'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * The Bloomin range plus the Flat Iron trial, onto the projects board.
 *
 * Idempotent — matches on title, so hitting it twice does nothing the second
 * time. Owners and dates are deliberately left blank except where they are
 * already known; that is the conversation to have in the room, not a guess.
 */

interface Seed {
  title: string
  kind: 'rd' | 'range'
  stage: 'brief' | 'development'
  accountName: string
  scope?: string
  dueDate?: string
  nextStep?: string
  checklist?: string[]
}

const SEEDS: Seed[] = [
  { title: 'Custard Syrup',                    kind: 'rd', stage: 'brief', accountName: 'Bloomin' },
  { title: 'White choc sauce',                 kind: 'rd', stage: 'brief', accountName: 'Bloomin' },
  { title: 'Jabuticaba syrup / Lucuma Syrup',  kind: 'rd', stage: 'brief', accountName: 'Bloomin',
    scope: 'Two syrups briefed together. Split into separate projects if they diverge on timing or spec.' },
  { title: 'Recovery blend',                   kind: 'rd', stage: 'brief', accountName: 'Bloomin' },
  { title: 'Tangerine syrup',                  kind: 'rd', stage: 'brief', accountName: 'Bloomin' },
  { title: "S'mores + Sticky Toffee",          kind: 'rd', stage: 'development', accountName: 'Bloomin',
    dueDate: '2026-09-11', nextStep: 'Finish up R&D', scope: 'R&D finishing 11 September.' },
  { title: 'Crackle Cup R&D',                  kind: 'rd', stage: 'development', accountName: 'Bloomin' },
  { title: 'Madeline / SS / Blondie',          kind: 'rd', stage: 'brief', accountName: 'Bloomin',
    scope: 'Three briefed together. Split if they diverge on timing or spec.' },
  { title: 'Date Spread',                      kind: 'rd', stage: 'brief', accountName: 'Bloomin' },

  {
    title: 'Flat Iron trial — syrup vs finished cocktail',
    kind: 'rd',
    stage: 'development',
    accountName: 'Flat Iron Square',
    scope:
      'Margarita, side by side at FIS: our finished pre-batch against a syrup version where the bar pours its own tequila. ' +
      'Chris is open to it and Dima builds both. Flat Iron Square house-pours Altos Plata and there is a live Altos activation ' +
      'this summer, so the trial already sits inside the Pernod contract.',
    nextStep: "Agree a date with Chris's team",
    checklist: [
      'Confirm the date with Chris’s team',
      'Dima builds the finished Margarita',
      'Dima builds the syrup version',
      'Confirm the bar’s own tequila is Altos Plata',
      'Agree how the two are judged, and by whom',
      'Run the trial',
      'Write up the verdict for Mark',
    ],
  },
]

export async function GET() {
  const created: string[] = []
  const skipped: string[] = []

  try {
    const snap = await getDocs(collection(db, 'projects'))
    const existing = new Set(
      snap.docs.map((d) => String(d.data().title ?? '').trim().toLowerCase())
    )

    for (const s of SEEDS) {
      if (existing.has(s.title.trim().toLowerCase())) {
        skipped.push(s.title)
        continue
      }
      await addDoc(collection(db, 'projects'), {
        title: s.title,
        kind: s.kind,
        stage: s.stage,
        accountName: s.accountName,
        ...(s.scope ? { scope: s.scope } : {}),
        ...(s.nextStep ? { nextStep: s.nextStep } : {}),
        ...(s.dueDate ? { dueDate: Timestamp.fromDate(new Date(s.dueDate + 'T12:00:00')) } : {}),
        checklist: (s.checklist ?? []).map((text, i) => ({
          id: `seed${i}${Math.random().toString(36).slice(2, 8)}`,
          text,
          done: false,
        })),
        updates: [{
          at: new Date().toISOString(),
          text: 'Added to the board',
          kind: 'auto',
        }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
      created.push(s.title)
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      createdTitles: created,
      skippedTitles: skipped,
      note: 'Owners, dates and scores are blank on purpose — those are the ranking conversation.',
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error), created }, { status: 500 })
  }
}
