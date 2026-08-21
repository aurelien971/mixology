import { NextRequest, NextResponse } from 'next/server'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const maxDuration = 300

// Bulk-import parsed blend sheets as PENDING drafts for human approval.
// Matches each draft to a catalog product (fuzzy, client-prefix aware) and to
// the ingredients library, and computes a 0-100 confidence score.

interface InDraft {
  kind: 'recipe' | 'process'
  sourceFile: string
  client?: string
  name?: string
  version?: string
  blendSize?: number
  totalQty?: number
  ingredients: { name: string; qtyPer1L: number }[]
  analyticalValues: { name: string; target?: number; min?: number; max?: number }[]
  cookingInstructions: string
  approxTimeMinutes?: number
  laborMinutes?: number
  parseWarnings?: string[]
}

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, ' ')
    .replace(/n\/a/g, 'na')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CLIENT_WORDS = ['pyro', 'sino', 'oudh', 'heard', 'ss', 's s', 'tms', 'spring street']

function cleanDraftName(raw: string): string {
  // strip client prefixes/suffixes and trailing underscores from names/filenames
  let n = raw.replace(/\.xlsx$/i, '').replace(/_+\s*$/, '').trim()
  const parts = n.split(/\s*-\s*/)
  if (parts.length > 1) {
    const kept = parts.filter(p => !CLIENT_WORDS.includes(norm(p)))
    if (kept.length > 0 && kept.length < parts.length) n = kept.join(' - ')
  }
  return n.trim().replace(/\s+/g, ' ')
}

function tokenScore(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter(Boolean))
  const tb = new Set(norm(b).split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  ta.forEach(t => { if (tb.has(t)) inter++ })
  return inter / Math.max(ta.size, tb.size)
}

function matchProduct(name: string, products: { id: string; name: string; productCode: string; volumeLitres: number }[]) {
  const n = norm(name)
  let best: { p: typeof products[0]; score: number } | null = null
  for (const p of products) {
    const pn = norm(p.name)
    let score = 0
    if (pn === n) score = 1
    else if (pn.includes(n) || n.includes(pn)) score = 0.82
    else score = tokenScore(name, p.name) * 0.8
    if (!best || score > best.score) best = { p, score }
  }
  return best && best.score >= 0.4 ? best : null
}

export async function POST(req: NextRequest) {
  try {
    const { drafts } = await req.json() as { drafts: InDraft[] }
    if (!drafts?.length) return NextResponse.json({ error: 'No drafts' }, { status: 400 })

    const [prodSnap, ingSnap, recSnap, draftSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'recipes')),
      getDocs(collection(db, 'recipeDrafts')),
    ])
    const products = prodSnap.docs.map(d => ({ id: d.id, ...(d.data() as { name: string; productCode: string; volumeLitres: number; isActive?: boolean }) }))
      .filter(p => p.isActive !== false)
    const ingredientKeys = new Set(ingSnap.docs.map(d => String(d.data().nameKey ?? '')))
    const recipesByProduct = new Set(recSnap.docs.map(d => String(d.data().productId ?? '')))
    const existingSources = new Set(draftSnap.docs.map(d => String(d.data().sourceFile ?? '')))

    let created = 0, skipped = 0
    const now = Timestamp.now()
    const summary: Record<string, unknown>[] = []

    for (const d of drafts) {
      if (existingSources.has(d.sourceFile)) { skipped++; continue }
      const name = cleanDraftName(d.name?.trim() || d.sourceFile.split('/').pop()!)

      // Ingredient matching against the library
      const ingRows = (d.ingredients ?? []).map(i => ({
        name: i.name.trim().replace(/\s+/g, ' '),
        qtyPer1L: i.qtyPer1L,
        matched: ingredientKeys.has(i.name.trim().toLowerCase().replace(/\s+/g, ' ')),
      }))
      const matchRate = ingRows.length ? ingRows.filter(r => r.matched).length / ingRows.length : 0

      // Product matching (recipes only)
      let productMatch = null
      if (d.kind === 'recipe') productMatch = matchProduct(name, products)

      // Confidence 0-100
      let conf = 0
      if (d.kind === 'recipe') {
        conf += productMatch ? Math.round(productMatch.score * 45) : 0
        conf += ingRows.length > 0 ? 15 : 0
        conf += Math.round(matchRate * 20)
        conf += d.cookingInstructions ? 10 : 0
        conf += (d.analyticalValues?.length ?? 0) > 0 ? 5 : 0
        if (d.totalQty !== undefined && d.blendSize && Math.abs(d.totalQty - d.blendSize) / d.blendSize < 0.15) conf += 5
      } else {
        conf += 35
        conf += ingRows.length > 0 ? 15 : 0
        conf += Math.round(matchRate * 25)
        conf += d.cookingInstructions ? 15 : 0
        conf += d.laborMinutes !== undefined ? 10 : 0
      }
      conf = Math.min(100, conf)

      const docData: Record<string, unknown> = {
        kind: d.kind,
        name,
        sourceFile: d.sourceFile,
        confidence: conf,
        ingredients: ingRows,
        analyticalValues: d.analyticalValues ?? [],
        cookingInstructions: d.cookingInstructions ?? '',
        status: 'pending',
        createdAt: now,
      }
      if (d.client?.trim()) docData.client = d.client.trim()
      if (d.version) docData.version = d.version
      if (d.approxTimeMinutes !== undefined) docData.approxTimeMinutes = d.approxTimeMinutes
      if (d.laborMinutes !== undefined) docData.laborMinutes = d.laborMinutes
      if (productMatch) {
        docData.matchedProductId = productMatch.p.id
        docData.matchedProductName = productMatch.p.name
        docData.matchedProductCode = productMatch.p.productCode
        docData.productHasRecipe = recipesByProduct.has(productMatch.p.id)
      }

      await addDoc(collection(db, 'recipeDrafts'), docData)
      created++
      summary.push({ name, kind: d.kind, confidence: conf, product: productMatch?.p.name ?? null, matchRate: Math.round(matchRate * 100) })
    }

    return NextResponse.json({ success: true, created, skippedExisting: skipped, summary })
  } catch (error) {
    console.error('import-recipe-drafts error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
