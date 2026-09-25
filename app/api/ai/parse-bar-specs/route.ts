import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

/**
 * Bar specs, as a bartender writes them: one serve, in millilitres.
 * A sheet or a photo usually holds several drinks at once, so this returns
 * all of them and the Recipes page walks through them one at a time.
 */
const SYSTEM = `You read cocktail bar specs out of screenshots and photos for Foodlab, a cocktail manufacturer.

These are BAR SPECS, not production sheets: each one is a single serve, written in millilitres, centilitres, grams or "each".

A sheet almost always holds SEVERAL drinks, one after another down the page. Work down the whole image and return EVERY drink on it — six, ten, twelve, however many are there. Never stop after the first one, and never return a single drink unless the image truly holds only one.

Return {"recipes": [Recipe, ...]} where Recipe is:
{
  "name": "the drink name as written",
  "variation": "string or null — the venue or client whose spec it is, if the sheet says",
  "ingredients": [{"name": "string, exactly as written", "amount": 25, "unit": "ml"}],
  "serveMl": 75,
  "glass": "string or null",
  "ice": "string or null",
  "garnish": "string or null",
  "method": "string or null — how it is built, shaken, stirred, strained",
  "notes": "string or null — anything written beside the spec, like a tasting note or a question"
}

Rules:
- "unit" is one of: ml, cl, g, kg, unit, dash. Convert nothing yourself — write the unit as the sheet writes it, and put the number in "amount".
- A range like "5-10ml" takes the lower number, and say so in notes.
- "Top soda", "top with prosecco" and other untimed pours: include the line with amount 0 and unit "ml", and repeat the wording in notes.
- serveMl: put 0. The serve is worked out from your lines afterwards, so do not add anything up.
- The drink's name is the heading on the LEFT, above or beside the build. A second name written to the right of it is a serving name or a menu name, not the drink: keep the left one as "name" and put the other in "notes".
- Keep ingredient names EXACTLY as written, including brands and venue tags. They are matched against an ingredient library afterwards.
- A line with no measure at all (e.g. "Mint leaves") still belongs in ingredients, with amount 0.
- If a drink's name is not written, use the closest heading above it.
- Never invent a drink, an ingredient or a measure. Read only what is there.`

const HEADINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['drinks'],
  properties: { drinks: { type: 'array', items: { type: 'string' } } },
} as const

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
        required: ['name', 'variation', 'ingredients', 'serveMl', 'glass', 'ice', 'garnish', 'method', 'notes'],
        properties: {
          name: { type: 'string' },
          variation: { type: ['string', 'null'] },
          serveMl: { type: 'number' },
          glass: { type: ['string', 'null'] },
          ice: { type: ['string', 'null'] },
          garnish: { type: ['string', 'null'] },
          method: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'amount', 'unit'],
              properties: {
                name: { type: 'string' },
                amount: { type: 'number' },
                unit: { type: 'string', enum: ['ml', 'cl', 'g', 'kg', 'unit', 'dash'] },
              },
            },
          },
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
    const pictures = images.map((img): Anthropic.Beta.BetaImageBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data },
    }))
    const ask = (system: string, schema: Record<string, unknown>, text: string) => client.beta.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: [...pictures, { type: 'text', text }] }],
    }).finalMessage()

    // Pass one: the list of drinks, so pass two has a checklist and cannot stop early.
    const list = await ask(
      'You read cocktail spec sheets. Return only the drink headings you can see, in the order they appear down the page. The heading is the name on the left of each block, not a second name written beside it.',
      HEADINGS_SCHEMA,
      'List every drink on this sheet, top to bottom.',
    )
    const headings: string[] = JSON.parse(list.content.find(b => b.type === 'text')?.text ?? '{"drinks":[]}').drinks ?? []

    type Spec = { name: string; serveMl: number; ingredients: { amount: number; unit: string; name: string }[] }
    const got: Spec[] = []
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
    const missing = () => headings.filter((h) => !got.some((r) => norm(r.name) === norm(h)))

    // A sheet of a dozen drinks sometimes comes back with two. Ask again for
    // whatever is still missing until the list is covered.
    for (let round = 0; round < 4; round++) {
      const want = headings.length ? missing() : []
      if (headings.length && !want.length) break
      const res = await ask(
        SYSTEM,
        SCHEMA,
        want.length
          ? `Give the full spec for ${want.length === 1 ? 'this drink' : 'these drinks'} on the sheet: ${want.join(', ')}. Return ${want.length} recipe${want.length === 1 ? '' : 's'}, one for each.`
          : 'Read every cocktail spec in these images, top to bottom. One serve each, in the measures written.',
      )
      if (res.stop_reason === 'refusal') {
        return NextResponse.json({ error: 'The AI declined to read these images — try clearer screenshots.' }, { status: 422 })
      }
      const batch = (JSON.parse(res.content.find(b => b.type === 'text')?.text ?? '{"recipes":[]}').recipes ?? []) as Spec[]
      // Asked for one drink and given one back: take it, whatever it called itself.
      if (want.length === 1 && batch.length === 1) batch[0].name = want[0]
      for (const r of batch) if (!got.some((x) => norm(x.name) === norm(r.name))) got.push(r)
      if (!headings.length) break
    }
    const parsedRecipes = headings.length
      ? headings.map((h) => got.find((r) => norm(r.name) === norm(h))).filter(Boolean) as Spec[]
      : got
    const parsed = { recipes: parsedRecipes }

    // The serve is arithmetic, so we do it here rather than trust it to the model:
    // every liquid line, cl counted as 10ml, garnish and egg white left out.
    for (const r of parsed.recipes ?? []) {
      r.serveMl = Math.round((r.ingredients ?? []).reduce((a, i) => {
        if (/egg white|^ice\b|^garnish/i.test(i.name.trim())) return a
        if (i.unit === 'ml' || i.unit === 'dash') return a + i.amount
        if (i.unit === 'cl') return a + i.amount * 10
        return a
      }, 0) * 10) / 10
    }
    return NextResponse.json({ success: true, headings, missing: missing().length ? missing() : undefined, ...parsed })
  } catch (error) {
    console.error('parse-bar-specs error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
