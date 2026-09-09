import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

/**
 * Read a delivery off a photo.
 *
 * What arrives on the pallet is a paper delivery note, an invoice, or a phone
 * photo of the boxes — never a tidy email. This reads whichever it is and
 * matches every line to the ingredients library, so receiving a delivery is
 * checking a table rather than retyping one.
 *
 * Quantities are the trap: a note says "6" and means six bottles, six cases of
 * six, or 6kg. The model is told to report packs, the pack as printed, and to
 * say when it is unsure rather than guess a number that silently lands in stock.
 */

const SYSTEM = `You read supplier delivery notes, invoices and photographs of goods delivered to Foodlab, a cocktail manufacturer in London.

You will be given one or more images. They may be:
- a printed delivery note or invoice (most common — LWC, Amathus, Matthew Clark and similar drinks wholesalers)
- a photo of the actual boxes, bottles or drums that arrived
- several photos of the same document, or of different pages

Extract every line that represents goods delivered.

For each line report:
- rawText: the line exactly as it appears, so a human can check it against the paper
- productName: the product on its own, without codes, quantities or prices
- packs: how many PACKS arrived, as a number. A "pack" is one sellable unit — one bottle, one case, one drum, one bag-in-box. If the note says "6 x 70cl" that is 6 packs of 0.7L. If it says "2 cases of 12" and the ingredient is tracked per bottle, that is 24 packs — but only convert like this when the case size is printed. When you genuinely cannot tell, put your best number and set confidence to "low".
- packDescription: the pack as printed, e.g. "70cl bottle", "6 x 1L", "25kg drum", or null
- unitPrice: the price of ONE pack in GBP if the document prints it, else null. Never infer a price from a line total unless the quantity is unambiguous.
- matchedIngredientId: the id from the provided ingredients list that this line is, or null when nothing is a genuine match. Match on the product, not the brand alone — "Beefeater London Dry 70cl" matches a Beefeater Gin ingredient. Do not match a different product just because the words overlap.
- confidence: "high" when the line and the quantity are both unambiguous, "medium" when the match is right but the quantity needed interpreting, "low" when either is a guess.

Also report:
- supplier: who delivered it, or null
- deliveryDate: the date on the document as YYYY-MM-DD, or null
- reference: the delivery note or invoice number, or null
- notes: anything a human needs to know — a line you could not read, a shortfall or "back order" marked on the note, a price that looks wrong, an item that is not in the ingredients list. Null when there is nothing to say.

Rules:
- Only report goods. Skip delivery charges, deposits, VAT lines and totals.
- Never invent a line you cannot see. A blurred or cut-off line goes in notes.
- If the images show no delivery at all, return an empty items array and say so in notes.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'supplier', 'deliveryDate', 'reference', 'notes'],
  properties: {
    supplier: { type: ['string', 'null'] },
    deliveryDate: { type: ['string', 'null'] },
    reference: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rawText', 'productName', 'packs', 'packDescription', 'unitPrice', 'matchedIngredientId', 'confidence'],
        properties: {
          rawText: { type: 'string' },
          productName: { type: 'string' },
          packs: { type: 'number' },
          packDescription: { type: ['string', 'null'] },
          unitPrice: { type: ['number', 'null'] },
          matchedIngredientId: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

interface LibraryLine {
  id: string
  name: string
  packDescription?: string
  packSize?: number
  packUnit?: string
  supplier?: string
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }, { status: 500 })
  }
  try {
    const { images, ingredients } = await req.json() as {
      images: { media_type: ImageMediaType; data: string }[]
      ingredients: LibraryLine[]
    }
    if (!images?.length) return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
    if (images.length > 8) return NextResponse.json({ error: 'Eight photos at a time is the limit' }, { status: 400 })

    const client = new Anthropic()

    const library = (ingredients ?? [])
      .map((i) => `${i.id} | ${i.name} | ${i.packDescription ?? `${i.packSize ?? '?'}${i.packUnit ?? ''}`}${i.supplier ? ` | ${i.supplier}` : ''}`)
      .join('\n')

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.map((img): Anthropic.Beta.BetaImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.media_type, data: img.data },
      })),
      {
        type: 'text',
        text: `Read what was delivered from ${images.length === 1 ? 'this photo' : `these ${images.length} photos`}.\n\n`
          + `Match each line against our ingredients library below — the format is id | name | pack | supplier. `
          + `Use the id exactly as written, or null when nothing genuinely matches.\n\n${library}`,
      },
    ]

    // Server-side fallback so a classifier false positive cannot fail a delivery.
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The AI declined to read these photos — try a clearer shot.' }, { status: 422 })
    }
    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text)

    // Never trust an id we did not hand it — a hallucinated id would post stock
    // against the wrong ingredient, which is worse than not matching at all.
    const valid = new Set((ingredients ?? []).map((i) => i.id))
    interface ParsedLine { matchedIngredientId: string | null; confidence: string }
    parsed.items = (parsed.items ?? []).map((it: ParsedLine) => (
      it.matchedIngredientId && valid.has(it.matchedIngredientId)
        ? it
        : { ...it, matchedIngredientId: null, confidence: 'low' }
    ))

    return NextResponse.json({ success: true, ...parsed })
  } catch (error) {
    console.error('parse-delivery-photo error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
