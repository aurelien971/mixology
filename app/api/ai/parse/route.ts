import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const PRODUCT_SYSTEM = `You are a data parser for a cocktail supply business called Foodlab.
Extract product information from the user's input (CSV, pasted text, screenshot text, or description).

Return ONLY valid JSON — no markdown, no explanation. Format:
{
  "products": [
    {
      "name": "string",
      "category": "one of: Highball | Martini | Sour | Negroni | Margarita | Spritz | G&T | Old Fashioned | Milk Punch | Tropical | Savoury | Coffee | Non-Alcoholic | Other",
      "recommendedServingG": number (in ml/g),
      "costToMake": number (production cost in GBP — if not given, estimate based on category),
      "isNonAlcoholic": boolean,
      "servingNotes": "string or empty string"
    }
  ]
}

Rules:
- If serving size is in ml, treat as grams (1:1 for cocktails)
- If a price column exists labelled "cost", "price per unit", or similar, use it as costToMake
- If category is unclear, infer from the cocktail name
- Non-alcoholic if name contains N/A, non-alcoholic, mocktail, or 0%
- Always return an array even for a single product`

const ORDER_SYSTEM = `You are an intelligent order parser for Foodlab, a cocktail supply business.
Parse the user's input (email, CSV, screenshot text, Nory PO, or description) into a structured order.

Return ONLY valid JSON — no markdown, no explanation. Format:
{
  "accountName": "string (the restaurant/venue name)",
  "poReference": "string or empty string",
  "notes": "string or empty string",
  "lineItems": [
    {
      "productName": "string (match as closely as possible to known cocktail names)",
      "quantity": number
    }
  ]
}

Known accounts: Pyro, Heard Soho, Heard Borough, Spring Street Pizza, Sino, Oudh 1722.
If the account name doesn't exactly match, return your best guess — the user will confirm.
Quantities should be number of units/bottles ordered, not litres.`

async function callOpenAI(systemPrompt: string, userContent: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI error: ${response.status} — ${err}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''

  try {
    return JSON.parse(content)
  } catch {
    // Strip markdown code fences if GPT added them anyway
    const cleaned = content.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  }
}

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('placeholder')) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your .env.local file.' },
      { status: 400 }
    )
  }

  const { type, input } = await req.json()

  if (!input?.trim()) {
    return NextResponse.json({ error: 'No input provided' }, { status: 400 })
  }

  try {
    if (type === 'product') {
      const parsed = await callOpenAI(PRODUCT_SYSTEM, input)
      return NextResponse.json({ success: true, type: 'product', data: parsed })
    }

    if (type === 'order') {
      const parsed = await callOpenAI(ORDER_SYSTEM, input)
      return NextResponse.json({ success: true, type: 'order', data: parsed })
    }

    return NextResponse.json({ error: 'type must be "product" or "order"' }, { status: 400 })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}