import { NextResponse } from 'next/server'
import {
  collection, getDocs, addDoc, updateDoc,
  query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function GET() {
  const log: string[] = []

  try {
    const targets = ['Spicy Margarita', 'Olive Oil Negroni']
    const codeMap: Record<string, string> = {
      'Spicy Margarita':   'FL-300035',
      'Olive Oil Negroni': 'FL-300036',
    }
    const baseCodes: Record<string, string> = {
      'Spicy Margarita':   'FL-100035',
      'Olive Oil Negroni': 'FL-100036',
    }

    for (const name of targets) {
      // 1. Find the existing 5L product
      const snap = await getDocs(
        query(collection(db, 'products'), where('name', '==', name))
      )

      if (snap.empty) {
        log.push(`SKIP ${name} — not found in products`)
        continue
      }

      // Make sure the existing doc is 5L
      const existing = snap.docs[0]
      const data = existing.data() as Record<string, any>

      if ((data.volumeLitres ?? 5) !== 5) {
        await updateDoc(existing.ref, { volumeLitres: 5, updatedAt: Timestamp.now() })
        log.push(`FIXED ${name} (${data.productCode}) → volumeLitres set to 5`)
      } else {
        log.push(`OK    ${name} (${data.productCode}) already 5L`)
      }

      // 2. Check if 19L doc already exists
      const existing19 = await getDocs(
        query(collection(db, 'products'), where('productCode', '==', codeMap[name]))
      )

      if (!existing19.empty) {
        log.push(`SKIP  ${codeMap[name]} — 19L product already exists`)
        continue
      }

      // 3. Create 19L product doc
      const newDoc = {
        productCode:         codeMap[name],
        baseCode:            baseCodes[name],
        name,
        category:            data.category,
        costToMake:          data.costToMake,
        costMissing:         data.costMissing ?? false,
        recommendedServingG: data.recommendedServingG,
        volumeLitres:        19,
        isNonAlcoholic:      data.isNonAlcoholic ?? false,
        isCoreRange:         data.isCoreRange ?? false,
        isActive:            true,
        createdAt:           Timestamp.now(),
        updatedAt:           Timestamp.now(),
      }
      if (data.servingNotes) (newDoc as any).servingNotes = data.servingNotes
      if (data.defaultPricePerLitre) (newDoc as any).defaultPricePerLitre = data.defaultPricePerLitre

      await addDoc(collection(db, 'products'), newDoc)
      log.push(`CREATED ${codeMap[name]} — ${name} 19L keg`)
    }

    return NextResponse.json({ success: true, log })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}