import { NextResponse } from 'next/server'
import {
  collection, getDocs, addDoc, deleteDoc, query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const RD_ORDERS = [
  // DLBD / Oso
  { displayName: 'DLBD Ltd (Oso)',                 baseCompany: 'DLBD Ltd',      description: '6 speciality cocktails',                           rdPrice: 18000, billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  { displayName: 'DLBD Ltd (Oso)',                 baseCompany: 'DLBD Ltd',      description: '3 coolers',                                        rdPrice: 3000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  { displayName: 'DLBD Ltd (Oso)',                 baseCompany: 'DLBD Ltd',      description: '3 cocktails',                                      rdPrice: 9000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  // Spring Street / Spring Street Bar
  { displayName: 'Spring Street (Spring Street Bar)', baseCompany: 'Spring Street', description: '6 martinis',                                   rdPrice: 6000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  { displayName: 'Spring Street (Spring Street Bar)', baseCompany: 'Spring Street', description: '2 Italian cocktails',                          rdPrice: 2000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  { displayName: 'Spring Street (Spring Street Bar)', baseCompany: 'Spring Street', description: 'Wine list',                                    rdPrice: 5000,  billingEntity: 'BAEK', category: 'wine_consulting', assignee: 'Majken', terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: 'Yes — sent to legal' },
  // DLBD / Dhuma
  { displayName: 'DLBD Ltd (Dhuma)',               baseCompany: 'DLBD Ltd',      description: 'Specialty cocktail list — 3 cocktails',            rdPrice: 3000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  { displayName: 'DLBD Ltd (Dhuma)',               baseCompany: 'DLBD Ltd',      description: 'Wine list',                                        rdPrice: 15000, billingEntity: 'BAEK', category: 'wine_consulting', assignee: 'Majken', terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: 'Yes — sent to legal' },
  // Heard / Covent Garden
  { displayName: 'Heard (Covent Garden)',           baseCompany: 'Heard',         description: '2 new cocktails',                                  rdPrice: 6000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: 'If cocktail numbers change we need to change invoiced amount',            contract: '' },
  { displayName: 'Heard (Covent Garden)',           baseCompany: 'Heard',         description: '3 dessert style cocktails',                        rdPrice: 9000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: 'If cocktail numbers change we need to change invoiced amount',            contract: '' },
  // Tisto
  { displayName: 'Tisto',                          baseCompany: 'Tisto',         description: 'R&D — £650 per cocktail (number of cocktails TBC)', rdPrice: 0,    billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: 'Aurelien/Dima to confirm number of cocktails, then charge at £650/cocktail', contract: '' },
  // DLBD / Baraki
  { displayName: 'DLBD Ltd (Baraki)',              baseCompany: 'DLBD Ltd',      description: '6 new cocktails',                                  rdPrice: 6000,  billingEntity: 'SBC',  category: 'cocktail_rd',    assignee: 'Dima',   terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: '' },
  { displayName: 'DLBD Ltd (Baraki)',              baseCompany: 'DLBD Ltd',      description: 'Wine list',                                        rdPrice: 15000, billingEntity: 'BAEK', category: 'wine_consulting', assignee: 'Majken', terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: 'Yes — sent to legal' },
  // DLBD / Omakaze
  { displayName: 'DLBD Ltd (Omakaze)',             baseCompany: 'DLBD Ltd',      description: 'Alcohol tasting and non-alcoholic tasting',         rdPrice: 18000, billingEntity: 'BAEK', category: 'wine_consulting', assignee: 'Majken', terms: '50% upfront, 50% on completion', notes: '',                                                                       contract: 'No — needs clarity from Majken' },
]

const ACCOUNT_ALIASES: Record<string, string[]> = {
  'DLBD Ltd':     ['DLBD', 'Dreamlab', 'DLB'],
  'Spring Street':['Spring Street Pizza'],
  'Heard':        ['Heard Soho', 'Heard Borough'],
}

async function findOrCreateAccount(baseCompany: string): Promise<string> {
  const all = await getDocs(collection(db, 'accounts'))
  const candidates = [baseCompany, ...(ACCOUNT_ALIASES[baseCompany] ?? [])]

  for (const candidate of candidates) {
    const match = all.docs.find(d => {
      const t = ((d.data() as any).tradingName ?? '').toLowerCase()
      return t === candidate.toLowerCase() || t.startsWith(candidate.toLowerCase())
    })
    if (match) return match.id
  }

  // Create new
  const ref = await addDoc(collection(db, 'accounts'), {
    tradingName:  baseCompany,
    legalName:    baseCompany,
    type:         'external',
    email:        '',
    paymentTerms: 'net_30',
    address:      { line1: '', city: '', postcode: '' },
    businessLine: 'cocktail',
    createdAt:    Timestamp.now(),
    updatedAt:    Timestamp.now(),
  })
  return ref.id
}

async function getNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const snap = await getDocs(collection(db, 'orders'))
  return `FL-${year}-${String(snap.size + 1).padStart(4, '0')}`
}

export async function GET() {
  const log: string[] = []
  let deleted = 0; let created = 0

  try {
    // Step 1: Delete all R&D orders with no outcomes and no price (safe = untouched seed orders)
    const allOrders = await getDocs(collection(db, 'orders'))
    for (const d of allOrders.docs) {
      const o = d.data() as any
      if (o.type === 'rd' && (o.rdOutcomes ?? []).length === 0 && !o.rdPrice) {
        await deleteDoc(d.ref)
        log.push(`DELETED ${o.orderNumber} — ${o.accountName}`)
        deleted++
      }
    }
    log.push(`--- Deleted ${deleted} old R&D seed orders ---`)

    // Step 2: Create 14 new orders
    for (const row of RD_ORDERS) {
      const accountId = await findOrCreateAccount(row.baseCompany)
      const orderNumber   = await getNextOrderNumber()
      const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`
      const vatAmt = row.rdPrice > 0 ? Math.round(row.rdPrice * 0.2 * 100) / 100 : 0
      const total  = Math.round((row.rdPrice + vatAmt) * 100) / 100

      const brief = [
        row.description,
        `Terms: ${row.terms}`,
        row.notes ? `Notes: ${row.notes}` : null,
        row.contract ? `Contract: ${row.contract}` : null,
        `Billing entity: ${row.billingEntity} | Invoice when project starts`,
      ].filter(Boolean).join('\n')

      const orderData: any = {
        orderNumber, invoiceNumber,
        accountId,
        accountName:  row.displayName,
        type:         'rd',
        status:       'received',
        rdStatus:     'in_progress',
        rdAssignee:   row.assignee,
        rdBrief:      brief,
        rdOutcomes:   [],
        rdPrice:      row.rdPrice,
        category:     row.category,
        lineItems:    [],
        subtotal:     row.rdPrice,
        vatRate:      0.2,
        vatAmount:    vatAmt,
        total,
        createdAt:    Timestamp.now(),
        updatedAt:    Timestamp.now(),
      }
      if (row.notes) orderData.notes = row.notes

      await addDoc(collection(db, 'orders'), orderData)
      log.push(`CREATED ${orderNumber} — ${row.displayName} | ${row.description} | £${row.rdPrice.toLocaleString()} | ${row.billingEntity} | ${row.assignee}`)
      created++
    }

    return NextResponse.json({ success: true, deleted, created, log })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: String(error), log }, { status: 500 })
  }
}