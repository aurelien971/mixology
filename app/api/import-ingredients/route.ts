import { NextRequest, NextResponse } from 'next/server'
import { collection, getDocs, addDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const maxDuration = 120

// Bulk-import ingredients (e.g. from the monthly stock take spreadsheet).
// POST { items: [{ name, format, packUnit, packSize, packPrice, packDescription }] }
// Skips any ingredient whose normalised name already exists.

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

interface ImportItem {
  name: string
  format: string
  packUnit: 'kg' | 'L' | 'unit'
  packSize: number
  packPrice: number
  packDescription: string
}

// List current ingredients (for auditing against the spreadsheet)
export async function GET() {
  const snap = await getDocs(collection(db, 'ingredients'))
  return NextResponse.json({
    ingredients: snap.docs.map(d => {
      const x = d.data()
      return { name: x.name, nameKey: x.nameKey, packSize: x.packSize, packUnit: x.packUnit, packPrice: x.packPrice, pricePerUnit: x.pricePerUnit, isProcess: !!x.isProcess }
    }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { items, updatePrices } = await req.json() as { items: ImportItem[]; updatePrices?: boolean }
    if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })

    const existing = await getDocs(collection(db, 'ingredients'))
    const byKey = new Map(existing.docs.map(d => {
      const data = d.data()
      const key = typeof data.nameKey === 'string' ? data.nameKey : normalizeKey(String(data.name ?? ''))
      return [key, d] as const
    }))
    const existingKeys = new Set(byKey.keys())

    const created: string[] = []
    const skipped: string[] = []
    const updated: string[] = []
    const now = Timestamp.now()

    for (const item of items) {
      const name = item.name.trim().replace(/\s+/g, ' ')
      const key = normalizeKey(name)
      if (!name) continue
      if (existingKeys.has(key)) {
        const docSnap = byKey.get(key)!
        const cur = docSnap.data()
        // Never touch processes — their price is derived from sub-ingredients
        if (updatePrices && !cur.isProcess) {
          const packSize = Number(item.packSize) || 1
          const packPrice = Number(item.packPrice) || 0
          const changed = Math.abs((cur.packPrice ?? 0) - packPrice) > 0.005 || Math.abs((cur.packSize ?? 0) - packSize) > 0.0001
          if (changed && packPrice > 0) {
            await updateDoc(docSnap.ref, {
              packSize,
              packUnit: item.packUnit === 'kg' ? 'kg' : item.packUnit === 'unit' ? 'unit' : 'L',
              packPrice,
              pricePerUnit: packSize > 0 ? Math.round((packPrice / packSize) * 100) / 100 : 0,
              packDescription: item.packDescription ?? cur.packDescription,
              updatedAt: now,
            })
            updated.push(name)
            continue
          }
        }
        skipped.push(name)
        continue
      }
      const packSize = Number(item.packSize) || 1
      const packPrice = Number(item.packPrice) || 0
      await addDoc(collection(db, 'ingredients'), {
        name,
        nameKey: key,
        format: item.format ?? 'bottle',
        currency: 'GBP',
        packDescription: item.packDescription ?? `${packSize}${item.packUnit} ${item.format}`,
        packSize,
        packUnit: item.packUnit === 'kg' ? 'kg' : item.packUnit === 'unit' ? 'unit' : 'L',
        packPrice,
        pricePerUnit: packSize > 0 ? Math.round((packPrice / packSize) * 100) / 100 : 0,
        currentStock: 0,
        createdAt: now,
        updatedAt: now,
      })
      existingKeys.add(key)
      created.push(name)
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      updated: updated.length,
      updatedNames: updated,
      skippedExisting: skipped.length,
      message: `Imported ${created.length}, updated ${updated.length} price${updated.length !== 1 ? 's' : ''}, skipped ${skipped.length} unchanged`,
    })
  } catch (error) {
    console.error('import-ingredients error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
