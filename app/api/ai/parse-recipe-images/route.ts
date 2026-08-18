import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

const SYSTEM = `You extract cocktail production recipes from screenshots of spreadsheets for Foodlab, a cocktail manufacturer.

The screenshots follow (roughly) this layout: recipe name + variation at the top, a table of ingredients with "Quantity per 1000 litres" and/or "Quantity for 1 litre" columns (unit usually KG), an "Analytical Values" table (Brix, pH, acidity, water activity, cooking temp — with min/target/max and conditions of test), and "COOKING INSTRUCTIONS" as a series of steps. Some fields may be missing.

Multiple screenshots may be parts of the SAME recipe (scrolled views) or DIFFERENT recipes — group them sensibly: if two screenshots show the same recipe name, merge them into one recipe.

Return a JSON object: {"recipes": [Recipe, ...]} where Recipe is:
{
  "name": "string — recipe name, e.g. 'Margarita Pre-Batch'",
  "variation": "string or null — e.g. 'Catalina Miami'",
  "version": "string or null",
  "createdBy": "string or null",
  "dateCreated": "string or null",
  "ingredients": [
    {"name": "string", "supplier": "string or null", "code": "string or null", "unit": "KG", "qtyPer1000L": 674.34, "qtyPer1L": 0.6743}
  ],
  "analyticalValues": [
    {"name": "Brix", "min": 25.5, "target": 26.3, "max": 27, "notes": "must only be done at 20C"}
  ],
  "cookingInstructions": "all steps in order, one per line"
}

Rules:
- Only include ingredients that actually have quantities; skip empty rows.
- If only qtyPer1000L is given, compute qtyPer1L = qtyPer1000L / 1000 (and vice versa).
- Use null for dashes/missing analytical values; omit rows that are entirely empty.
- Keep ingredient names EXACTLY as written (trimmed) — they are matched against an ingredients database.
- cookingInstructions: every step, in order, separated by newlines.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'variation', 'version', 'createdBy', 'dateCreated', 'ingredients', 'analyticalValues', 'cookingInstructions'],
        properties: {
          name: { type: 'string' },
          variation: { type: ['string', 'null'] },
          version: { type: ['string', 'null'] },
          createdBy: { type: ['string', 'null'] },
          dateCreated: { type: ['string', 'null'] },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'supplier', 'code', 'unit', 'qtyPer1000L', 'qtyPer1L'],
              properties: {
                name: { type: 'string' },
                supplier: { type: ['string', 'null'] },
                code: { type: ['string', 'null'] },
                unit: { type: 'string' },
                qtyPer1000L: { type: 'number' },
                qtyPer1L: { type: 'number' },
              },
            },
          },
          analyticalValues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'min', 'target', 'max', 'notes'],
              properties: {
                name: { type: 'string' },
                min: { type: ['number', 'null'] },
                target: { type: ['number', 'null'] },
                max: { type: ['number', 'null'] },
                notes: { type: ['string', 'null'] },
              },
            },
          },
          cookingInstructions: { type: 'string' },
        },
      },
    },
  },
} as const

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }, { status: 500 })
  }
  try {
    const { images } = await req.json() as { images: { media_type: ImageMediaType; data: string }[] }
    if (!images?.length) return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    if (images.length > 10) return NextResponse.json({ error: 'Maximum 10 screenshots at a time' }, { status: 400 })

    const client = new Anthropic()

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.map((img): Anthropic.Beta.BetaImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.media_type, data: img.data },
      })),
      { type: 'text', text: `Extract the recipe(s) from these ${images.length} screenshot(s).` },
    ]

    // Server-side fallback enabled by default so classifier false-positives can't fail the parse
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The AI declined to process these images — try clearer screenshots.' }, { status: 422 })
    }
    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text)
    return NextResponse.json({ success: true, ...parsed })
  } catch (error) {
    console.error('parse-recipe-images error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
