import { NextResponse } from 'next/server'
import { collection, getDocs, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function GET() {
  try {
    const snap = await getDocs(collection(db, 'accountPricing'))
    const results: string[] = []
    let updated = 0

    for (const d of snap.docs) {
      const { rrp, pricePerUnit, venueGpPercent: oldGp, accountName, productName } = d.data()
      if (!rrp || !pricePerUnit) continue

      const rrpExVat   = rrp / 1.2
      const newGp      = Math.round(((rrpExVat - pricePerUnit) / rrpExVat) * 10000) / 100

      if (Math.abs(newGp - (oldGp ?? 0)) < 0.01) continue  // already correct

      await updateDoc(d.ref, { venueGpPercent: newGp, updatedAt: Timestamp.now() })
      results.push(`${accountName} · ${productName}: ${oldGp?.toFixed(1)}% → ${newGp.toFixed(1)}% (ex-VAT)`)
      updated++
    }

    return NextResponse.json({
      success: true,
      updated,
      message: updated === 0
        ? 'All GP% already on ex-VAT basis'
        : `Patched ${updated} records to ex-VAT GP%`,
      results,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}