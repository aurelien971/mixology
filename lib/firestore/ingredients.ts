import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Ingredient, StockMovement, StockMovementType, PackUnit, IngredientFormat, Currency } from '@/types'

const COL = 'ingredients'
const MOVEMENTS = 'stockMovements'

function r2(n: number) { return Math.round(n * 100) / 100 }

// Canonical key so "Citric acid ", "citric  Acid" and "Citric Acid" are the same ingredient
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// "heard soho" → "Heard Soho"; reuses an existing supplier's exact spelling when it matches
export function normalizeSupplier(name: string, existingSuppliers: string[]): string {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  const match = existingSuppliers.find(s => s.toLowerCase() === cleaned.toLowerCase())
  if (match) return match
  return cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function derivePricePerUnit(packPrice: number, packSize: number): number {
  return packSize > 0 ? r2(packPrice / packSize) : 0
}

function toIngredient(id: string, d: Record<string, unknown>): Ingredient {
  return {
    ...d,
    id,
    stockUpdatedAt: (d.stockUpdatedAt as Timestamp)?.toDate?.(),
    createdAt: (d.createdAt as Timestamp)?.toDate?.() ?? new Date(),
    updatedAt: (d.updatedAt as Timestamp)?.toDate?.() ?? new Date(),
  } as Ingredient
}

export async function getIngredients(): Promise<Ingredient[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')))
  return snap.docs.map(d => toIngredient(d.id, d.data()))
}

export async function getIngredient(id: string): Promise<Ingredient | null> {
  const snap = await getDoc(doc(db, COL, id))
  return snap.exists() ? toIngredient(snap.id, snap.data()) : null
}

export interface NewIngredientInput {
  name: string
  supplier?: string
  format?: IngredientFormat
  currency?: Currency
  packDescription: string
  packSize: number
  packUnit: PackUnit
  packPrice: number
  currentStock?: number
}

export async function createIngredient(input: NewIngredientInput): Promise<string> {
  const now = Timestamp.now()
  const data: Record<string, unknown> = {
    name: input.name.trim().replace(/\s+/g, ' '),
    nameKey: normalizeIngredientName(input.name),
    packDescription: input.packDescription,
    packSize: input.packSize,
    packUnit: input.packUnit,
    packPrice: input.packPrice,
    pricePerUnit: derivePricePerUnit(input.packPrice, input.packSize),
    currentStock: input.currentStock ?? 0,
    createdAt: now,
    updatedAt: now,
  }
  if (input.supplier?.trim()) data.supplier = input.supplier.trim()
  if (input.format) data.format = input.format
  data.currency = input.currency ?? 'GBP'
  const ref = await addDoc(collection(db, COL), data)
  return ref.id
}

export async function updateIngredient(id: string, data: Partial<Ingredient>): Promise<void> {
  const patch: Record<string, unknown> = { ...data, updatedAt: Timestamp.now() }
  delete patch.id
  if (typeof data.name === 'string') {
    patch.name = data.name.trim().replace(/\s+/g, ' ')
    patch.nameKey = normalizeIngredientName(data.name)
  }
  // Keep derived £/unit in sync whenever pack price or size changes
  if (data.packPrice !== undefined || data.packSize !== undefined) {
    const current = await getIngredient(id)
    const price = data.packPrice ?? current?.packPrice ?? 0
    const size  = data.packSize ?? current?.packSize ?? 0
    patch.pricePerUnit = derivePricePerUnit(price, size)
  }
  await updateDoc(doc(db, COL, id), patch)
}

export async function deleteIngredient(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

// Find an existing ingredient by (normalised) name, or create it
export async function findOrCreateIngredient(
  name: string,
  existing: Ingredient[],
  defaults?: Partial<NewIngredientInput>
): Promise<{ id: string; created: boolean }> {
  const key = normalizeIngredientName(name)
  const match = existing.find(i => i.nameKey === key)
  if (match) return { id: match.id, created: false }
  const id = await createIngredient({
    name,
    packDescription: defaults?.packDescription ?? '1kg pack',
    packSize: defaults?.packSize ?? 1,
    packUnit: defaults?.packUnit ?? 'kg',
    packPrice: defaults?.packPrice ?? 0,
    supplier: defaults?.supplier,
  })
  return { id, created: true }
}

// ── Stock movements ──────────────────────────────────────────────────────────

export async function recordStockMovement(params: {
  ingredientId: string
  ingredientName: string
  type: StockMovementType
  packsDelta: number            // for 'stocktake' pass the ABSOLUTE new value here
  orderId?: string
  orderNumber?: string
  note?: string
}): Promise<number> {
  const now = Timestamp.now()
  const ing = await getIngredient(params.ingredientId)
  const prev = ing?.currentStock ?? 0
  const newStock = params.type === 'stocktake'
    ? r2(params.packsDelta)
    : r2(prev + params.packsDelta)

  await updateDoc(doc(db, COL, params.ingredientId), {
    currentStock: newStock,
    stockUpdatedAt: now,
    updatedAt: now,
  })

  const mov: Record<string, unknown> = {
    ingredientId: params.ingredientId,
    ingredientName: params.ingredientName,
    type: params.type,
    packsDelta: params.type === 'stocktake' ? r2(newStock - prev) : r2(params.packsDelta),
    newStock,
    createdAt: now,
  }
  if (params.orderId) mov.orderId = params.orderId
  if (params.orderNumber) mov.orderNumber = params.orderNumber
  if (params.note) mov.note = params.note
  await addDoc(collection(db, MOVEMENTS), mov)
  return newStock
}

// Fast decrement without a prior read (used for production deductions in bulk)
export async function decrementStock(id: string, packs: number): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    currentStock: increment(-packs),
    stockUpdatedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
}

export async function getStockMovements(limitCount = 100): Promise<StockMovement[]> {
  const snap = await getDocs(query(collection(db, MOVEMENTS), orderBy('createdAt', 'desc')))
  return snap.docs.slice(0, limitCount).map(d => {
    const data = d.data()
    return { ...data, id: d.id, createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? new Date() } as StockMovement
  })
}
