import { NextResponse } from 'next/server'
import { collection, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function GET() {
  try {
    const accountRef = await addDoc(collection(db, 'accounts'), {
      tradingName:  'Last Train',
      legalName:    'Last Train',
      type:         'external',
      email:        '',
      phone:        '',
      paymentTerms: 'net_30',
      address:      { line1: '', city: '', postcode: '' },
      businessLine: 'cocktail',
      createdAt:    Timestamp.now(),
      updatedAt:    Timestamp.now(),
    })

    const brief = `Korean BBQ cocktail menu for Last Train — KBBQ concept.

COCKTAIL LIST (9 drinks to develop):

Highballs & Cocktails:
• Yuzu Highball — Bright, cold and citrus-led
• Perilla Highball — Fresh, aromatic and distinctly Korean
• Green Plum Highball — Fragrant, tart and refreshing
• Soju Highball — Light and designed for longer evenings
• Makgeolli Spritz — Soft, sparkling and lower in alcohol
• Black Sesame Old Fashioned — Rich, nutty and built for later in the night
• Yuzu Margarita — Citrus, salt and freshness
• Lychee & Shiso Collins — Floral, fresh and tall
• Yuja & Honey Highball — Bright, fragrant and gently sweet

CONCEPT CONTEXT:
Korean BBQ restaurant. Base spirits centred around Soju and Korean ingredients (yuzu/yuja, perilla, makgeolli, green plum, black sesame, lychee, shiso).

Korean beers on menu: Terra, Kloud, Kelly. Makgeolli offer: Original, Chestnut, Banana, Seasonal fruit.
House pour ritual (Soju) — table-side serve as a signature experience.
Highball-led cocktail list to complement KBBQ dining.`

    const year = new Date().getFullYear()
    const snap = await import('firebase/firestore').then(m => m.getDocs(m.collection(db, 'orders')))
    const orderNumber   = `FL-${year}-${String(snap.size + 1).padStart(4, '0')}`
    const invoiceNumber = `INV-${orderNumber.replace('FL-', '')}`

    const orderRef = await addDoc(collection(db, 'orders'), {
      orderNumber,
      invoiceNumber,
      accountId:   accountRef.id,
      accountName: 'Last Train',
      type:        'rd',
      status:      'received',
      rdStatus:    'in_progress',
      rdAssignee:  'Dima',
      rdBrief:     brief,
      rdOutcomes:  [],
      rdPrice:     0,
      category:    'cocktail_rd',
      lineItems:   [],
      subtotal:    0,
      vatRate:     0.2,
      vatAmount:   0,
      total:       0,
      createdAt:   Timestamp.now(),
      updatedAt:   Timestamp.now(),
    })

    return NextResponse.json({
      success: true,
      accountId: accountRef.id,
      orderId:   orderRef.id,
      orderNumber,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}