'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import Button from '@/components/ui/Button'
import { StaffUser } from '@/lib/firestore/staffUsers'
import { currentUserName } from '@/lib/currentUser'
import { computeRecipeCost } from '@/lib/costing'
import {
  OVERLAP_LABEL, priceMaths, gpColor, SSB_NEXT, SSB_ROAD, roadIndex, serveOf, VENUE_GP_TARGET,
} from '@/lib/ssb'
import {
  Ingredient, Product, Recipe, SsbDrink, MenuOverlap, SSB_STAGES, CORE_RANGE, matchesClassic,
} from '@/types'
import toast from 'react-hot-toast'

interface Props {
  drink: SsbDrink
  products: Product[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  staff: StaffUser[]
  onPatch: (data: Partial<SsbDrink>, note?: string, auto?: string) => Promise<void>
  onClose: () => void
}

const INK = '#111827'
const SECONDARY = '#6b7280'
const MUTED = '#9ca3af'
const card: React.CSSProperties = { background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }
const kicker: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13.5px', color: '#374151', border: '1px solid #e5e7eb',
  borderRadius: '8px', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit',
}
const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
  fontSize: '12.5px', color: SECONDARY, textDecoration: 'underline',
}
const money = (n: number) => '£' + n.toFixed(2)

export default function SsbDrinkPanel({ drink: d, products, recipes, ingredients, staff, onPatch, onClose }: Props) {
  const [note, setNote] = useState('')
  const stage = SSB_STAGES.find((s) => s.value === d.stage) ?? SSB_STAGES[0]
  const dropped = d.stage === 'dropped'
  const idx = roadIndex(d.stage)
  const next = SSB_NEXT[d.stage]
  const ov = OVERLAP_LABEL[d.overlap]
  const maths = priceMaths(d.cost, d.sale)
  const sheet = priceMaths(d.sheetCost, d.sheetSale)
  const priceChanged = Math.abs(d.cost - d.sheetCost) >= 0.005 || Math.abs(d.sale - d.sheetSale) >= 0.005
  const serve = serveOf(d)

  // Our side of it: the classic it matches, its recipe and what it costs us.
  const ours = useMemo(() => {
    if (!d.classicName) return null
    const product = products.find((p) => p.isActive !== false && p.isClassic && (matchesClassic(p.name) ?? p.name) === d.classicName)
    const recipe = product ? recipes.find((r) => r.productId === product.id) : undefined
    const cost = recipe ? computeRecipeCost(recipe, ingredients) : null
    return { product, recipe, cost }
  }, [d.classicName, products, recipes, ingredients])

  async function setPrice(field: 'cost' | 'sale', raw: string) {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(n) || n <= 0) return
    const val = Math.round(n * 100) / 100
    if (val === d[field]) return
    // A confirmed price that moves is no longer the price that was confirmed.
    await onPatch(
      { [field]: val, ...(d.priceConfirmed ? { priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined } : {}) },
      undefined,
      d.priceConfirmed ? 'Price changed after it was confirmed — needs confirming again' : undefined
    )
  }

  async function confirmPrice(on: boolean) {
    if (!on) return onPatch({ priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined }, undefined, 'Price unconfirmed')
    const who = currentUserName() ?? undefined
    await onPatch(
      { priceConfirmed: true, priceConfirmedBy: who, priceConfirmedAt: new Date().toISOString() },
      undefined,
      `Price confirmed: ${money(d.sale)} on the menu, ${money(d.cost)} cost, ${maths.gp.toFixed(1)}% GP`
    )
  }

  async function signOff() {
    if (!d.priceConfirmed && !confirm(`The price for ${d.name} is not confirmed yet. Sign it off anyway?`)) return
    const who = currentUserName() ?? undefined
    await onPatch(
      { stage: 'signed_off', signedOffBy: who, signedOffAt: new Date().toISOString(), nextStep: undefined },
      undefined,
      `Signed off for the trial${who ? ` by ${who}` : ''}`
    )
    toast.success(`${d.name} signed off`)
  }

  const recent = (d.updates ?? []).slice(0, 12)

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: INK }}>{d.name}</h2>
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: ov.bg, color: ov.fg }}>
              {ov.label}{d.classicName ? ` · ${d.classicName}` : ''}
            </span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: MUTED }}>
            Spring Street Bar · #{d.order} on the menu{serve ? ` · ${serve}ml serve` : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>Close ✕</Button>
      </div>

      {/* the road */}
      <div style={{ ...card, marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: stage.bg, color: stage.fg }}>
            {stage.label}
          </span>
          <span style={{ fontSize: '12.5px', color: SECONDARY }}>
            {dropped
              ? <button onClick={() => onPatch({ stage: 'to_review' }, undefined, 'Back on the menu')} style={linkBtn}>Put it back on the menu</button>
              : <>
                  {d.stage !== 'changes' && d.stage !== 'signed_off' && (
                    <><button onClick={() => onPatch({ stage: 'changes' })} style={linkBtn}>They asked for changes</button>{' · '}</>
                  )}
                  <button onClick={() => { if (confirm(`Drop ${d.name} from the menu?`)) onPatch({ stage: 'dropped' }) }} style={linkBtn}>Drop from the menu</button>
                </>}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SSB_ROAD.length}, minmax(0,1fr))`, opacity: dropped ? 0.4 : 1 }}>
          {SSB_ROAD.map((s, i) => {
            const info = SSB_STAGES.find((x) => x.value === s)!
            const done = !dropped && i < idx
            const here = !dropped && i === idx
            return (
              <button key={s} onClick={() => onPatch({ stage: s })} title={`Set to "${info.label}"`}
                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', position: 'relative' }}>
                {i > 0 && <span style={{ position: 'absolute', top: '13px', right: '50%', width: '100%', height: '2px', background: done || here ? INK : '#e5e7eb' }} />}
                <span style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px', borderRadius: '50%', fontSize: '12px', fontWeight: 700,
                  background: done ? INK : here ? '#fff' : '#f3f4f6', color: done ? '#fff' : here ? INK : MUTED,
                  border: here ? `2px solid ${INK}` : '2px solid transparent', boxShadow: '0 0 0 3px #fff',
                }}>{done ? '✓' : i + 1}</span>
                <span style={{ display: 'block', marginTop: '6px', fontSize: '11.5px', color: here ? INK : done ? SECONDARY : MUTED, fontWeight: here ? 700 : 500 }}>
                  {info.label}{here && d.stage === 'changes' ? ' · changes asked' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* do next */}
      {!dropped && (
        <div style={{
          ...card, marginBottom: '14px',
          border: `1.5px solid ${d.stage === 'signed_off' ? '#bbf7d0' : d.stage === 'changes' ? '#fcd34d' : '#e5e7eb'}`,
          background: d.stage === 'signed_off' ? '#f0fdf4' : d.stage === 'changes' ? '#fffbeb' : '#fff',
        }}>
          <p style={kicker}>Do next</p>
          {d.stage === 'signed_off' ? (
            <p style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#166534' }}>
              ✓ Signed off{d.signedOffBy ? ` by ${d.signedOffBy}` : ''}{d.signedOffAt ? ` on ${format(new Date(d.signedOffAt), 'EEE d MMM')}` : ''} — ready for the trial.
            </p>
          ) : (
            <>
              <input
                key={`next-${d.nextStep ?? ''}`}
                defaultValue={d.nextStep ?? ''}
                placeholder={stage.doNext}
                onBlur={(e) => e.target.value.trim() !== (d.nextStep ?? '') && onPatch({ nextStep: e.target.value.trim() || undefined })}
                style={{ ...input, fontSize: '17px', fontWeight: 600, color: INK, border: '1px solid transparent', background: 'transparent', padding: '4px 0' }}
              />
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                {d.stage === 'approved'
                  ? <Button onClick={signOff}>✓ Sign off for the trial</Button>
                  : next && <Button onClick={() => onPatch({ stage: next, nextStep: undefined })}>✓ Done — go to &ldquo;{SSB_STAGES.find((s) => s.value === next)?.label}&rdquo;</Button>}
                {d.stage === 'approved' && !d.priceConfirmed && (
                  <span style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 600 }}>Confirm the price first →</span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: SECONDARY, marginLeft: 'auto' }}>
                  Owner
                  <select value={d.owner ?? ''} onChange={(e) => onPatch({ owner: e.target.value || undefined })}
                    style={{ ...input, width: '140px', padding: '6px 8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <option value="">—</option>
                    {staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
                  </select>
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: '14px' }}>
        {/* left */}
        <div style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
          <div style={card}>
            <p style={kicker}>Their spec{d.spec && d.spec.fromName !== d.name ? ` · was "${d.spec.fromName}" on the spec sheet` : ''}</p>
            {d.spec ? (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                  <tbody>
                    {d.spec.ingredients.map((l, i) => (
                      <tr key={l.name + i} style={{ borderTop: i ? '1px solid #f9fafb' : 'none' }}>
                        <td style={{ padding: '6px 10px 6px 0', color: INK }}>{l.name}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: SECONDARY, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {l.amount ?? ''} {l.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginTop: '12px', fontSize: '13px' }}>
                  {d.spec.glass && <><span style={{ color: MUTED }}>Glass</span><span style={{ color: INK }}>{d.spec.glass}</span></>}
                  {d.spec.garnish && <><span style={{ color: MUTED }}>Garnish</span><span style={{ color: INK }}>{d.spec.garnish}</span></>}
                  {d.spec.method && <><span style={{ color: MUTED }}>Method</span><span style={{ color: INK }}>{d.spec.method}</span></>}
                </div>
                {d.spec.notes && <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: '8px' }}>{d.spec.notes}</p>}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>
                Not on Tom&apos;s spec sheet.{d.overlap !== 'none' ? ` Start from our ${d.classicName}.` : ' Ask Tom for the spec.'}
              </p>
            )}
          </div>

          <div style={card}>
            <p style={kicker}>What they said</p>
            <input
              key={`fb-${d.feedback ?? ''}`}
              defaultValue={d.feedback ?? ''}
              placeholder="Their latest feedback — e.g. more yuzu, change the name"
              onBlur={(e) => e.target.value.trim() !== (d.feedback ?? '') && onPatch({ feedback: e.target.value.trim() || undefined })}
              style={{ ...input, marginBottom: '14px', fontWeight: d.feedback ? 600 : 400 }}
            />
            <p style={kicker}>Write down what happened</p>
            <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await onPatch({}, note); setNote('') }}
              style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tasted with Tom, wants it less sweet…" style={input} />
              <Button type="submit" disabled={!note.trim()}>Save</Button>
            </form>
            {recent.map((u, i) => (
              <div key={u.at + i} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderTop: '1px solid #fafafa' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', marginTop: '6px', flex: 'none', background: u.kind === 'note' ? INK : '#d1d5db' }} />
                <div>
                  <p style={{ margin: 0, fontSize: '13px', color: u.kind === 'note' ? INK : SECONDARY }}>{u.kind === 'note' && <strong>Note: </strong>}{u.text}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: MUTED }}>{format(new Date(u.at), 'EEE d MMM, HH:mm')}{u.by ? ` · ${u.by}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* right */}
        <div style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
          <div style={{ ...card, border: `1.5px solid ${d.priceConfirmed ? '#bbf7d0' : '#e5e7eb'}` }}>
            <p style={kicker}>Price</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <label>
                <span style={{ ...kicker, margin: '0 0 4px', display: 'block' }}>Cost per serve</span>
                <input key={`c-${d.cost}`} defaultValue={d.cost.toFixed(2)} inputMode="decimal" onBlur={(e) => setPrice('cost', e.target.value)}
                  style={{ ...input, fontFamily: 'monospace', fontSize: '15px' }} />
              </label>
              <label>
                <span style={{ ...kicker, margin: '0 0 4px', display: 'block' }}>Menu price (inc VAT)</span>
                <input key={`s-${d.sale}`} defaultValue={d.sale.toFixed(2)} inputMode="decimal" onBlur={(e) => setPrice('sale', e.target.value)}
                  style={{ ...input, fontFamily: 'monospace', fontSize: '15px' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center', padding: '10px 0', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6' }}>
              <div><p style={{ ...kicker, margin: 0 }}>Net sale</p><p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 600, color: INK }}>{money(maths.net)}</p></div>
              <div><p style={{ ...kicker, margin: 0 }}>Margin</p><p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 600, color: INK }}>{money(maths.margin)}</p></div>
              <div><p style={{ ...kicker, margin: 0 }}>GP</p><p style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 700, color: gpColor(maths.gp) }}>{maths.gp.toFixed(1)}%</p></div>
            </div>
            {priceChanged && (
              <p style={{ margin: '10px 0 0', fontSize: '12px', color: SECONDARY }}>
                On the menu sheet: {money(d.sheetCost)} cost, {money(d.sheetSale)} price, {sheet.gp.toFixed(1)}% GP
              </p>
            )}
            {maths.gp < VENUE_GP_TARGET && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#b45309' }}>Under the {VENUE_GP_TARGET}% a venue expects.</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
              <Button variant={d.priceConfirmed ? 'secondary' : 'primary'} onClick={() => confirmPrice(!d.priceConfirmed)}>
                {d.priceConfirmed ? '✓ Price confirmed' : 'Confirm this price'}
              </Button>
              {d.priceConfirmed && (
                <span style={{ fontSize: '12px', color: MUTED }}>
                  {d.priceConfirmedBy ? `by ${d.priceConfirmedBy} ` : ''}{d.priceConfirmedAt ? `on ${format(new Date(d.priceConfirmedAt), 'd MMM')}` : ''}
                </span>
              )}
            </div>
          </div>

          <div style={card}>
            <p style={kicker}>Our range</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <select
                value={d.overlap}
                onChange={(e) => {
                  const overlap = e.target.value as MenuOverlap
                  onPatch({ overlap, ...(overlap === 'none' ? { classicName: undefined } : {}) }, undefined, `Now: ${OVERLAP_LABEL[overlap].label}`)
                }}
                style={{ ...input, cursor: 'pointer' }}
              >
                <option value="same">Same as our classic</option>
                <option value="twist">Twist on our classic</option>
                <option value="none">Bespoke — not in our range</option>
              </select>
              <select
                value={d.classicName ?? ''}
                disabled={d.overlap === 'none'}
                onChange={(e) => onPatch({ classicName: e.target.value || undefined })}
                style={{ ...input, cursor: 'pointer', opacity: d.overlap === 'none' ? 0.5 : 1 }}
              >
                <option value="">Which classic?</option>
                {CORE_RANGE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {d.overlap === 'none' ? (
              <p style={{ margin: 0, fontSize: '13px', color: SECONDARY }}>Bespoke to Spring Street Bar — its recipe is written from their spec.</p>
            ) : !ours?.product ? (
              <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>Pick which classic it matches.</p>
            ) : (
              <div style={{ fontSize: '13px' }}>
                <p style={{ margin: '0 0 4px', color: INK }}>
                  <strong>{d.classicName}</strong> <span style={{ color: MUTED, fontFamily: 'monospace', fontSize: '12px' }}>{ours.product.productCode}</span>
                </p>
                {ours.recipe ? (
                  <p style={{ margin: 0, color: SECONDARY }}>
                    <Link href={`/recipes/${ours.recipe.id}`} style={{ color: '#1d4ed8' }}>Our recipe</Link>
                    {ours.cost && ours.cost.complete && (
                      <> · costs us {money(ours.cost.costPerLitre)}/L{serve ? ` · about ${money((ours.cost.costPerLitre * serve) / 1000)} for a ${serve}ml serve` : ''}</>
                    )}
                    {ours.cost && !ours.cost.complete && <span style={{ color: '#b45309' }}> · some ingredients have no price yet</span>}
                  </p>
                ) : (
                  <p style={{ margin: 0, color: '#b45309' }}>
                    We have no recipe for our {d.classicName} yet — <Link href="/objectives/rollout" style={{ color: '#991b1b', fontWeight: 600 }}>write it from Rollout</Link>.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
