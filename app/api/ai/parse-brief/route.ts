import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

/**
 * Read a client brief — the email and whatever came attached to it.
 *
 * Briefs arrive as "we got the list from Tom, trial service is September 28"
 * with a spreadsheet of bar specs. Everything the platform needs is in there:
 * who it is for, which dates matter, what the drinks are and how they are
 * built. This pulls it out once so nobody retypes a spec sheet into four pages.
 *
 * It only reads. Nothing is written until a person has looked at the result.
 */

const SYSTEM = `You read client briefs for Foodlab, a London cocktail production company that makes batched cocktails and syrups for bars and restaurants.

A brief is usually a short internal email plus attachments: a spreadsheet of bar specs, a PDF menu, or photos. Extract everything the team needs to act on it.

ACCOUNT
- Work out which venue or client this is for. Match it to the provided accounts list (format: id | name) when it is genuinely the same business. Abbreviations count, but several accounts can share a prefix (a group's bar and its restaurant), so match the exact venue.
- When the email and the attachment point at different venues, or an abbreviation fits more than one account, trust the name written in the attachment, and say plainly in warnings which accounts it could be. Use the id exactly, or null.
- name: the venue as it should be written.

DATES
- Every date that matters: trial service, tasting, launch, menu change, delivery deadline.
- Resolve relative and partial dates against today's date, which is given. "September 28" means the next September 28 on or after today.
- kind: "trial" for a trial or soft-launch service, "tasting" for a tasting session, "launch" for opening or menu launch, "deadline" for anything we must deliver by, "other" otherwise.

DRINKS
- One entry per drink in the specs. Keep the name exactly as written.
- ingredients: every line of the spec with its amount and unit as written per serve (ml, cl, oz, dash, barspoon, drop, g, piece, leaf…). amount null when there is none (e.g. "top with soda").
- matchedIngredientId: the id from the provided ingredients library when the line is genuinely that product, else null. Do not match a different product because words overlap.
- serveMl: total liquid per serve in ml if it can be worked out, else null.
- glass, garnish, method: as written, or null.
- format: "premix" if it is or could be a fully batched drink including spirit, "syrup" if the brief says the venue pours the spirit, "unclear" otherwise.
- menuPrice: the price of one serve on their menu in GBP including VAT, when the material gives it, else null. A menu or costing sheet usually has a "Sale" or "Price" column.
- costPerServe: their own cost for one serve in GBP when the material gives it (a "Cost" column), else null. Do not invent it from ingredients.
- notes: anything about the drink a bartender would need that does not fit elsewhere. Spreadsheets often carry a feedback or sign-off column beside a drink ("YES", "Good", "change name", "needs something citrus?", "move to a low ball") — that is the client's verdict, so put it here verbatim and prefixed "Feedback:".

SPEC SHEETS ARE MESSY — handle it like a bartender would
- A range ("5-10ml") → use the midpoint as amount and say so in notes.
- Alternatives ("rittenhouse/knob creek/bullit", "vodka/gin", "50ml prosecco /75ml prosecco") → one line, the first option's amount, the options named in the ingredient name.
- "Top with soda", "mint leaves" and similar → amount null, unit as the nearest word ("top", "leaves").
- A unit that is impossible for one serve ("20l brine") is a typo — correct it to the obvious unit (20ml) and list the correction in warnings.
- Batches written per serve for a freezer door or pre-batch are still per serve — do not scale them.
- Fat-washed, oil-washed or infused spirits keep the full name as written, but match matchedIngredientId to the base bottle they are made from ("Coffee Oil washed Beefeater Dry Gin" → Beefeater). The wash is prep done in-house; the bottle bought is still the base spirit.
- Names in bar specs are often misspelled or shortened ("Del Miguey" for Del Maguey, "bullit" for Bulleit, "Havana 3" for Havana Club 3). Match through an obvious misspelling. A generic word with no brand ("gin", "tequila", "sweet vermouth") is not a match to any one bottle — leave it null.

ALSO
- summary: two or three plain sentences — who, what, by when.
- pricingRequested: true when the brief asks for pricing.
- nextSteps: the concrete actions the email implies, short imperative phrases.
- warnings: anything unreadable, ambiguous or missing (a drink with no quantities, a date without a year that could be either, an attachment you could not read). Null when there is nothing.

Never invent a drink, ingredient or date that is not in the material.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['account', 'summary', 'events', 'drinks', 'pricingRequested', 'nextSteps', 'warnings'],
  properties: {
    account: {
      type: 'object',
      additionalProperties: false,
      required: ['matchedAccountId', 'name'],
      properties: {
        matchedAccountId: { type: ['string', 'null'] },
        name: { type: 'string' },
      },
    },
    summary: { type: 'string' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'kind', 'label'],
        properties: {
          date: { type: 'string' },
          kind: { type: 'string', enum: ['trial', 'tasting', 'launch', 'deadline', 'other'] },
          label: { type: 'string' },
        },
      },
    },
    drinks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'ingredients', 'serveMl', 'glass', 'garnish', 'method', 'format', 'notes', 'menuPrice', 'costPerServe'],
        properties: {
          name: { type: 'string' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'amount', 'unit', 'matchedIngredientId'],
              properties: {
                name: { type: 'string' },
                amount: { type: ['number', 'null'] },
                unit: { type: 'string' },
                matchedIngredientId: { type: ['string', 'null'] },
              },
            },
          },
          serveMl: { type: ['number', 'null'] },
          glass: { type: ['string', 'null'] },
          garnish: { type: ['string', 'null'] },
          method: { type: ['string', 'null'] },
          format: { type: 'string', enum: ['premix', 'syrup', 'unclear'] },
          notes: { type: ['string', 'null'] },
          menuPrice: { type: ['number', 'null'] },
          costPerServe: { type: ['number', 'null'] },
        },
      },
    },
    pricingRequested: { type: 'boolean' },
    nextSteps: { type: 'array', items: { type: 'string' } },
    warnings: { type: ['string', 'null'] },
  },
} as const

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

interface Body {
  emailText?: string
  today: string
  texts?: { name: string; text: string }[]
  images?: { name: string; media_type: ImageMediaType; data: string }[]
  pdfs?: { name: string; data: string }[]
  accounts: { id: string; name: string }[]
  ingredients: { id: string; name: string }[]
}

interface ParsedLine { matchedIngredientId: string | null }
interface ParsedDrink { ingredients: ParsedLine[] }
interface Parsed {
  account: { matchedAccountId: string | null; name: string }
  drinks: ParsedDrink[]
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }, { status: 500 })
  }
  try {
    const body = await req.json() as Body
    const texts = body.texts ?? []
    const images = body.images ?? []
    const pdfs = body.pdfs ?? []
    if (!body.emailText?.trim() && !texts.length && !images.length && !pdfs.length) {
      return NextResponse.json({ error: 'Nothing to read — paste the email or drop an attachment' }, { status: 400 })
    }
    if (images.length > 10) return NextResponse.json({ error: 'Ten images at a time is the limit' }, { status: 400 })

    const client = new Anthropic()

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...pdfs.map((p): Anthropic.Beta.BetaRequestDocumentBlock => ({
        type: 'document',
        title: p.name,
        source: { type: 'base64', media_type: 'application/pdf', data: p.data },
      })),
      ...images.map((img): Anthropic.Beta.BetaImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.media_type, data: img.data },
      })),
      ...texts.map((t): Anthropic.Beta.BetaTextBlockParam => ({
        type: 'text',
        text: `ATTACHMENT: ${t.name}\n${t.text}`,
      })),
      {
        type: 'text',
        text: [
          `Today is ${body.today}.`,
          body.emailText?.trim() ? `EMAIL:\n${body.emailText.trim()}` : 'No email text — the attachments are the whole brief.',
          `ACCOUNTS (id | name):\n${body.accounts.map((a) => `${a.id} | ${a.name}`).join('\n')}`,
          `INGREDIENTS LIBRARY (id | name):\n${body.ingredients.map((i) => `${i.id} | ${i.name}`).join('\n')}`,
        ].join('\n\n'),
      },
    ]

    // Streamed, not one blocking call. A spec sheet with a dozen drinks takes
    // minutes to write out, and a connection that carries nothing for that long
    // gets closed from the other end before the answer arrives.
    const response = await client.beta.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    }).finalMessage()

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The AI declined to read this brief.' }, { status: 422 })
    }
    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text) as Parsed

    // Only ids we handed over survive — a made-up id would link a recipe to the
    // wrong ingredient or a tasting to the wrong client.
    const accountIds = new Set(body.accounts.map((a) => a.id))
    const ingredientIds = new Set(body.ingredients.map((i) => i.id))
    if (parsed.account.matchedAccountId && !accountIds.has(parsed.account.matchedAccountId)) {
      parsed.account.matchedAccountId = null
    }
    for (const d of parsed.drinks) {
      for (const line of d.ingredients) {
        if (line.matchedIngredientId && !ingredientIds.has(line.matchedIngredientId)) line.matchedIngredientId = null
      }
    }

    return NextResponse.json({ success: true, ...parsed })
  } catch (error) {
    console.error('parse-brief error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
