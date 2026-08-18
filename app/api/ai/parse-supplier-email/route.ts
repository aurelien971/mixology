import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'supplier', 'notes'],
  properties: {
    supplier: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rawText', 'matchedIngredientId', 'matchedIngredientName', 'packs', 'confidence'],
        properties: {
          rawText: { type: 'string' },
          matchedIngredientId: { type: ['string', 'null'] },
          matchedIngredientName: { type: ['string', 'null'] },
          packs: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }, { status: 500 })
  }
  try {
    const { emailText, ingredients } = await req.json() as {
      emailText: string
      ingredients: { id: string; name: string; packDescription: string; packSize: number; packUnit: string }[]
    }
    if (!emailText?.trim()) return NextResponse.json({ error: 'No email text provided' }, { status: 400 })

    const client = new Anthropic()

    const system = `You parse supplier order emails for Foodlab, a cocktail manufacturer. The user pastes the email they sent to (or received from) an ingredient supplier. Extract every ordered item and match it against Foodlab's ingredient list.

Foodlab's ingredients (id | name | pack):
${(ingredients ?? []).map(i => `${i.id} | ${i.name} | ${i.packDescription} (${i.packSize}${i.packUnit})`).join('\n')}

For each item in the email:
- "rawText": the line/phrase from the email describing the item
- "matchedIngredientId"/"matchedIngredientName": best match from the list above, or null if nothing matches
- "packs": how many PACKS of the matched ingredient this represents. If the email quantity is in kg or litres, convert using the pack size (e.g. 50kg ordered, 25kg drum pack → 2 packs). If it's already in bottles/drums/cases matching the pack, use that count.
- "confidence": high = certain match & quantity; medium = match likely but quantity converted/assumed; low = uncertain match.
Also return "supplier" (supplier name if identifiable) and "notes" (anything ambiguous the user should check).
Only include actual ordered items — skip greetings, prices, totals.`

    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: emailText }],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The AI declined to process this email.' }, { status: 422 })
    }
    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    return NextResponse.json({ success: true, ...JSON.parse(text) })
  } catch (error) {
    console.error('parse-supplier-email error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
