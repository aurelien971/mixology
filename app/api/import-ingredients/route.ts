import { NextRequest, NextResponse } from 'next/server'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
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

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: ImportItem[] }
    if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })

    const existing = await getDocs(collection(db, 'ingredients'))
    const existingKeys = new Set(
      existing.docs.map(d => {
        const data = d.data()
        return typeof data.nameKey === 'string' ? data.nameKey : normalizeKey(String(data.name ?? ''))
      })
    )

    const created: string[] = []
    const skipped: string[] = []
    const now = Timestamp.now()

    for (const item of items) {
      const name = item.name.trim().replace(/\s+/g, ' ')
      const key = normalizeKey(name)
      if (!name || existingKeys.has(key)) { skipped.push(name); continue }
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
      skippedExisting: skipped.length,
      skippedNames: skipped,
      message: `Imported ${created.length} ingredients${skipped.length ? `, skipped ${skipped.length} already present` : ''}`,
    })
  } catch (error) {
    console.error('import-ingredients error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
