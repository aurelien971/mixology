import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { MenuDrink, MenuStage, ProjectUpdate, MENU_STAGES, normalizeDrinkName } from '@/types'
import { stampAuthor } from '@/lib/currentUser'
import { prepare, forUpdate } from '@/lib/firestore/prepare'
import { createRollout, getRollouts, updateRolloutLogged } from '@/lib/firestore/rollouts'
import { getProducts } from '@/lib/firestore/catalog'
import { PYRO_ACCOUNT_ID, PYRO_BRIEF, PYRO_MENU_SEED } from '@/lib/pyroMenu'
import { SSB_ACCOUNT_ID, SSB_TRIAL, SSB_MENU_SEED, SSB_NOT_ON_MENU } from '@/lib/ssbMenu'

const COLLECTION = 'menuDrinks'

function fromFirestore(id: string, data: Record<string, unknown>): MenuDrink {
  const createdAt = (data.createdAt as Timestamp)?.toDate?.() ?? new Date()
  return {
    ...(data as Omit<MenuDrink, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    format: (data.format as MenuDrink['format']) ?? 'premix',
    createdAt,
    updatedAt: (data.updatedAt as Timestamp)?.toDate?.() ?? createdAt,
  }
}

const byOrder = (a: MenuDrink, b: MenuDrink) => a.order - b.order

export async function getAllMenuDrinks(): Promise<MenuDrink[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => fromFirestore(d.id, d.data())).sort(byOrder)
}

export async function getVenueMenu(venueId: string): Promise<MenuDrink[]> {
  const snap = await getDocs(query(collection(db, COLLECTION), where('venueId', '==', venueId)))
  return snap.docs.map((d) => fromFirestore(d.id, d.data())).sort(byOrder)
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'drink'

export type NewMenuDrink = Omit<MenuDrink, 'id' | 'createdAt' | 'updatedAt' | 'stage' | 'updates'> & {
  stage?: MenuStage
  firstLog?: string
}

/** Add a drink to a venue's menu, under a readable id that cannot collide. */
export async function addMenuDrink(data: NewMenuDrink): Promise<string> {
  const base = `${data.venueId}__${slugify(data.name)}`
  let id = base
  for (let n = 2; (await getDoc(doc(db, COLLECTION, id))).exists(); n++) id = `${base}-${n}`
  const { firstLog, ...rest } = data
  const at = new Date().toISOString()
  await setDoc(doc(db, COLLECTION, id), {
    ...(prepare({
      ...rest,
      stage: rest.stage ?? 'to_review',
      updates: stampAuthor([{ at, text: firstLog ?? 'Added to the menu', kind: 'auto' }]),
    }) as Record<string, unknown>),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return id
}

const money = (v: unknown) => (v === undefined || v === null ? '—' : `£${Number(v).toFixed(2)}`)
const stageLabel = (v: unknown) => MENU_STAGES.find((s) => s.value === v)?.label ?? String(v)

/** Save a drink and log what changed, with the signed-in name on the line. */
export async function updateMenuDrinkLogged(
  drink: MenuDrink,
  data: Partial<Omit<MenuDrink, 'id' | 'createdAt'>>,
  note?: string,
  auto?: string
): Promise<ProjectUpdate[]> {
  const at = new Date().toISOString()
  const entries: ProjectUpdate[] = []
  if (note?.trim()) entries.push({ at, text: note.trim(), kind: 'note' })
  if (auto?.trim()) entries.push({ at, text: auto.trim(), kind: 'auto' })

  type Loggable = keyof Omit<MenuDrink, 'id' | 'createdAt'>
  const described: Partial<Record<Loggable, (v: unknown) => string>> = {
    stage:       (v) => `Step → ${stageLabel(v)}`,
    menuPrice:   (v) => `Menu price ${money(drink.menuPrice)} → ${money(v)}`,
    ourPrice:    (v) => `Our price per serve ${money(drink.ourPrice)} → ${money(v)}`,
    theirCost:   (v) => `Their own cost per serve ${money(drink.theirCost)} → ${money(v)}`,
    spiritCost:  (v) => `Their spirit per serve ${money(drink.spiritCost)} → ${money(v)}`,
    serveMl:     (v) => (v ? `Serve → ${v}ml` : 'Serve size cleared'),
    format:      (v) => `Format → ${v === 'syrup' ? 'no spirit' : 'with spirit'}`,
    owner:       (v) => (v ? `Owner → ${v}` : 'Owner cleared'),
    nextStep:    (v) => (v ? `Next step: ${v}` : 'Next step cleared'),
    feedback:    (v) => (v ? `Their feedback: ${v}` : 'Feedback cleared'),
    classicName: (v) => (v ? `Matched to our ${v}` : 'No longer matched to a classic'),
    name:        (v) => `Renamed "${drink.name}" → "${v}"`,
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

/**
 * Spring Street Bar arrived as a menu and spec sheet before onboarding had
 * menus. Put it in once: only while it has no menu at all, and under fixed
 * ids — so it cannot duplicate, and removing it later does not bring it back.
 */
export async function setUpSpringStreetBar(): Promise<boolean> {
  const existing = await getVenueMenu(SSB_ACCOUNT_ID)
  if (existing.length > 0) return false
  const now = new Date()
  const venues = await getRollouts()
  if (!venues.some((v) => v.accountId === SSB_ACCOUNT_ID)) {
    await createRollout({
      accountId: SSB_ACCOUNT_ID,
      name: 'Spring Street Bar',
      stage: 'tasting_booked',
      tastingDate: SSB_TRIAL,
      contacts: [{ id: 'tom', name: 'Tom', role: 'Sent the menu and the bar specs' }],
      range: [],
      startedAt: now,
      brief: {
        summary: `Tom sent the bespoke drinks list for Spring Street Bar: 22 drinks with costs and menu prices, and bar specs for 10 of them. Pricing to work up. Trial service 28 September. ${SSB_NOT_ON_MENU}`,
        receivedAt: '2026-09-14',
        source: 'SSB Bar Specs.xlsx · menu costing sheet',
      },
      updates: [{ at: now.toISOString(), text: 'Added to onboarding with the menu and specs Tom sent', kind: 'auto' }],
    })
  }
  for (const s of SSB_MENU_SEED) {
    const ref = doc(db, COLLECTION, `${SSB_ACCOUNT_ID}__${s.slug}`)
    if ((await getDoc(ref)).exists()) continue
    await setDoc(ref, {
      ...(prepare({
        venueId: SSB_ACCOUNT_ID,
        name: s.name,
        order: s.order,
        overlap: s.overlap,
        classicName: s.classicName,
        format: 'premix',
        stage: 'to_review',
        menuPrice: s.menuPrice,
        theirCost: s.theirCost,
        spec: s.spec,
        feedback: s.feedback,
        updates: [{ at: now.toISOString(), text: 'On the menu Tom sent', kind: 'auto' }],
      }) as Record<string, unknown>),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  }
  return true
}

/**
 * Pyro's autumn/winter brief from Nico, put in once the same way: only while
 * Pyro has no menu, under fixed ids. Drinks staying or leaving are linked to
 * the products we already make for them, matched by name.
 */
export async function setUpPyroAutumnMenu(): Promise<boolean> {
  const existing = await getVenueMenu(PYRO_ACCOUNT_ID)
  if (existing.length > 0) return false
  const venue = (await getRollouts()).find((v) => v.accountId === PYRO_ACCOUNT_ID)
  if (!venue) return false
  const products = await getProducts()
  const key = (n: string) => normalizeDrinkName(n)
  const at = new Date().toISOString()
  for (const s of PYRO_MENU_SEED) {
    const ref = doc(db, COLLECTION, `${PYRO_ACCOUNT_ID}__${s.slug}`)
    if ((await getDoc(ref)).exists()) continue
    const product = s.productName
      ? products.find((p) => key(p.name) === key(s.productName!) && p.isActive !== false) ?? products.find((p) => key(p.name) === key(s.productName!))
      : undefined
    await setDoc(ref, {
      ...(prepare({
        venueId: PYRO_ACCOUNT_ID,
        name: s.name,
        order: s.order,
        overlap: s.overlap,
        classicName: s.classicName,
        productId: product?.id,
        format: 'premix',
        stage: s.stage,
        feedback: s.feedback,
        nextStep: s.nextStep,
        updates: [{ at, text: `${s.log} (brief from Nico)`, kind: 'auto' }],
      }) as Record<string, unknown>),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  }
  await updateRolloutLogged(
    venue,
    { brief: PYRO_BRIEF, nextStep: venue.nextStep ?? 'Book the first tasting — the menu launches mid-October' },
    undefined,
    `Autumn/winter brief from Nico added: ${PYRO_MENU_SEED.filter((x) => x.stage !== 'dropped').length} drinks on the menu, ${PYRO_MENU_SEED.filter((x) => x.stage === 'dropped').length} coming off`
  )
  return true
}
