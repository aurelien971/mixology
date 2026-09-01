import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

interface DrinkRow {
  name: string
  costNow: number | null
  costAfter: number | null
  gpNow: number | null
  gpAfter: number | null
  sellPerLitre: number
}

interface Body {
  swaps: { verdict: string; from: string; to: string; bottles: number; saving: number; retro: number; note: string }[]
  totals: { costSaving: number; retro: number; total: number; bottles: number }
  quarterSpend: number
  drinks: DrinkRow[]
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env.local' }, { status: 500 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const priced = body.drinks.filter((d) => d.costNow !== null && d.costAfter !== null)
  const moved = priced
    .filter((d) => Math.abs((d.costAfter ?? 0) - (d.costNow ?? 0)) > 0.001)
    .sort((a, b) => ((b.costNow ?? 0) - (b.costAfter ?? 0)) - ((a.costNow ?? 0) - (a.costAfter ?? 0)))

  const prompt = `You are writing a short internal note for Aurélien, who runs delivery at Foodlab, a drinks
manufacturer inside the Dreamlab group. He will forward the substance of this to Mark, his boss.

CONTEXT
Foodlab buys spirits through LWC. Its venues sit inside Lowline's Pernod Ricard UK contract, so the brands
Foodlab pours count toward group contract volumes and earn cash retro. Chris Howe (Lowline ops) has asked
Foodlab to move onto contract brands. Mark's brief estimated a 10–15% sourcing saving, unvalidated.

Foodlab's LWC spend, June–August 2026: £${body.quarterSpend.toFixed(0)}.

THE SWAPS
${body.swaps.map((s) => `- [${s.verdict}] ${s.from} → ${s.to}, ${s.bottles} bottles. Unit saving £${s.saving.toFixed(2)}, retro £${s.retro.toFixed(2)}. ${s.note}`).join('\n')}

TOTALS across everything taken: £${body.totals.costSaving.toFixed(2)} of unit cost, £${body.totals.retro.toFixed(2)} of retro,
£${body.totals.total.toFixed(2)} combined — ${((body.totals.total / body.quarterSpend) * 100).toFixed(1)}% of spend.

DRINKS THAT MOVE (cost per litre and Foodlab GP, before → after)
${moved.slice(0, 12).map((d) => `- ${d.name}: £${(d.costNow ?? 0).toFixed(2)} → £${(d.costAfter ?? 0).toFixed(2)}/L; GP ${d.gpNow === null ? 'n/a' : d.gpNow.toFixed(0) + '%'} → ${d.gpAfter === null ? 'n/a' : d.gpAfter.toFixed(0) + '%'}`).join('\n') || '- none priced yet'}

WRITE
Four short paragraphs, no headings, no bullet points, no preamble. Plain British English.
1. What the swaps are worth, honestly, against the 10–15% that was estimated. Do not inflate it.
2. Which single drink moves most and why that matters commercially.
3. The refusals — name them and say why taking a swap that loses money would be worse than not taking it.
4. What Aurélien should actually do next, concretely.

Be direct. No flattery, no "exciting", no management-speak. If the numbers are unimpressive, say so plainly —
the argument for the swaps is contract compliance, not cash. Under 320 words.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return NextResponse.json({ text })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
