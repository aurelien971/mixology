import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('placeholder')) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    const { sheetText } = await req.json()

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a recipe data extractor. Extract recipe data from spreadsheet text and return ONLY valid JSON, no markdown, no explanation.

JSON format:
{
  "name": "recipe name",
  "variation": "variation name or null",
  "version": "version number as string or null",
  "createdBy": "person name or null",
  "dateCreated": "date as string or null",
  "ingredients": [
    { "name": "ingredient name", "supplier": "supplier or null", "code": "code or null", "unit": "KG", "qtyPer1000L": 123.45, "qtyPer1L": 0.12345 }
  ],
  "analyticalValues": [
    { "name": "Brix", "min": 25.5, "target": 26.3, "max": 27.0, "notes": "must only be done at 20C" }
  ],
  "cookingInstructions": "full cooking instructions as a single string with newlines between steps"
}

Rules:
- Only include ingredients with actual quantities (skip empty rows)
- For analytical values, use null for dashes or missing values
- Include ALL cooking instruction steps in order
- If a field is missing, use null`,
          },
          {
            role: 'user',
            content: sheetText,
          },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('OpenAI error:', res.status, err)
      return NextResponse.json({ error: `OpenAI error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ text })
  } catch (e) {
    console.error('parse-recipe error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}