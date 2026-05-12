import { NextRequest, NextResponse } from 'next/server'
import {
  collection, getDocs, addDoc, query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const VAT = 0.20

function r2(n: number) { return Math.round(n * 100) / 100 }

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const snap = await getDocs(collection(db, 'orders'))
  const num  = snap.size + 1
  return `FL-${year}-${String(num).padStart(4, '0')}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await req.json() as {
      contactName: string
      notes?: string
      lineItems: { productId: string; productCode: string; productName: string; volumeLitres: number; quantity: number; unitPrice: number }[]
    }

    // Find account by token
    const accountSnap = await getDocs(
      query(collection(db, 'accounts'), where('clientToken', '==', token))
    )
    if (accountSnap.empty) {
      return NextResponse.json({ error: 'Invalid portal link' }, { status: 404 })
    }
    const accountDoc  = accountSnap.docs[0]
    const account     = accountDoc.data() as any

    if (!body.lineItems?.length) {
      return NextResponse.json({ error: 'No items in order' }, { status: 400 })
    }

    // Build line items
    const lineItems = body.lineItems.map(l => ({
      productId:    l.productId,
      productCode:  l.productCode,
      productName:  l.productName,
      volumeLitres: l.volumeLitres,
      quantity:     l.quantity,
      unitPrice:    l.unitPrice,
      lineTotal:    r2(l.quantity * l.unitPrice),
      servingSizeG: 0,
    }))

    const subtotal  = r2(lineItems.reduce((s, l) => s + l.lineTotal, 0))
    const vatAmount = r2(subtotal * VAT)
    const total     = r2(subtotal + vatAmount)

    const orderNumber   = await generateOrderNumber()
    const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`

    const orderData: any = {
      orderNumber,
      invoiceNumber,
      accountId:   accountDoc.id,
      accountName: account.tradingName,
      lineItems,
      subtotal,
      vatRate:     VAT,
      vatAmount,
      total,
      status:      'received',
      source:      'client_portal',
      portalContactName: body.contactName,
      notes: body.notes ? `Portal order from ${body.contactName}. ${body.notes}` : `Portal order from ${body.contactName}`,
      createdAt:   Timestamp.now(),
      updatedAt:   Timestamp.now(),
    }
    if (account.groupId)   orderData.groupId   = account.groupId
    if (account.groupName) orderData.groupName = account.groupName

    const ref = await addDoc(collection(db, 'orders'), orderData)

    // Create payment record
    const termsDays = account.paymentTerms === 'net_14' ? 14 : account.paymentTerms === 'net_60' ? 60 : 30
    const dueDate   = new Date()
    dueDate.setDate(dueDate.getDate() + termsDays)

    await addDoc(collection(db, 'payments'), {
      orderId:       ref.id,
      orderNumber,
      accountId:     accountDoc.id,
      accountName:   account.tradingName,
      invoiceNumber,
      amount:        total,
      dueDate:       Timestamp.fromDate(dueDate),
      status:        'pending',
      createdAt:     Timestamp.now(),
      updatedAt:     Timestamp.now(),
    })

    return NextResponse.json({ success: true, orderNumber })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}