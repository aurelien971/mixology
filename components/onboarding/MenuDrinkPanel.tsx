'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import Button from '@/components/ui/Button'
import { updateProduct } from '@/lib/firestore/catalog'
import { currentUserName } from '@/lib/currentUser'
import {
  OVERLAP_LABEL, RECIPE_NEED, GP_VERDICT, MENU_NEXT, MENU_ROAD, menuRoadIndex, stageInfo,
  DEFAULT_GP_TARGET, DEFAULT_MARGIN_FLOOR,
} from '@/lib/onboarding'
import { MenuDrink, MenuOverlap, CORE_RANGE, DevVariant } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, card, kicker, input, linkBtn, Pill, NumInput, money } from './shared'
import toast from 'react-hot-toast'

export default function MenuDrinkPanel({ ctx, drink: d, onClose }: { ctx: VenueCtx; drink: MenuDrink; onClose: () => void }) {
  const [note, setNote] = useState('')
  const st = ctx.states.get(d.id)
  if (!st) return null

  const target = ctx.venue.gpTarget ?? DEFAULT_GP_TARGET
  const floor = ctx.venue.marginFloor ?? DEFAULT_MARGIN_FLOOR
  const stage = stageInfo(d.stage)
  const dropped = d.stage === 'dropped'
  const idx = menuRoadIndex(d.stage)
  const next = MENU_NEXT[d.stage]
  const ov = OVERLAP_LABEL[d.overlap]
  const g = st.gp
  const gv = GP_VERDICT[g.verdict]
  const rn = RECIPE_NEED[st.recipeNeed]
  const patch = (data: Partial<MenuDrink>, n?: string, a?: string) => ctx.patchDrink(d, data, n, a)
  const unconfirm = d.priceConfirmed ? { priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined } : {}
  const ownBuildGp = d.theirCost && d.menuPrice ? ((d.menuPrice / 1.2 - d.theirCost) / (d.menuPrice / 1.2)) * 100 : null

  async function confirmPrice() {
    if (d.priceConfirmed) return patch({ priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined }, undefined, 'Price unconfirmed')
    if (g.verdict !== 'pass' && !confirm(`This price does not guarantee them ${target}% and us ${floor}%. Confirm it anyway?`)) return
    await patch(
      { priceConfirmed: true, priceConfirmedBy: currentUserName() ?? undefined, priceConfirmedAt: new Date().toISOString() },
      undefined,
      `Price confirmed: ${d.ourPrice ? money(d.ourPrice) : '—'} a serve to them, ${d.menuPrice ? money(d.menuPrice) : '—'} on their menu${g.venueGp !== undefined ? `, ${g.venueGp.toFixed(1)}% GP for them` : ''}`
    )
  }

  async function signOff() {
    if (st!.recipeNeed !== 'ready' && !confirm(`${d.name} has no recipe yet. Sign it off anyway?`)) return
    if (g.verdict !== 'pass' && !confirm(`${d.name} does not guarantee them ${target}% GP yet. Sign it off anyway?`)) return
    const who = currentUserName() ?? undefined
    await patch({ stage: 'signed_off', signedOffBy: who, signedOffAt: new Date().toISOString(), nextStep: undefined }, undefined, `Signed off${who ? ` by ${who}` : ''}`)
    // A drink we make for them becomes a real product the moment it is signed off.
    if (d.overlap !== 'same' && st!.own && st!.own.isActive === false) {
      await updateProduct(st!.own.id, { isActive: true })
      toast.success(`${st!.own.productCode} ${d.name} is live in the catalog`)
      await ctx.reload()
    } else {
      toast.success(`${d.name} signed off`)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: INK }}>{d.name}</h2>
            <Pill bg={ov.bg} fg={ov.fg}>{ov.label}{d.classicName ? ` · ${d.classicName}` : ''}</Pill>
            {d.format === 'syrup' && <Pill bg="#f3f4f6" fg="#4b5563">No spirit</Pill>}
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: MUTED }}>
            {ctx.venue.name} · #{d.order} on their menu{st.serve ? ` · ${st.serve}ml serve` : ''}{st.own ? ` · ${st.own.productCode}${st.own.isActive === false ? ' (live at sign-off)' : ''}` : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>Close ✕</Button>
      </div>

      {/* road */}
      <div style={{ ...card, marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <Pill bg={stage.bg} fg={stage.fg}>{stage.label}</Pill>
          <span style={{ fontSize: '12.5px', color: SECONDARY }}>
            {dropped
              ? <button onClick={() => patch({ stage: 'to_review' }, undefined, 'Back on the menu')} style={linkBtn}>Put it back on the menu</button>
              : <>
                  {d.stage !== 'changes' && d.stage !== 'signed_off' && <><button onClick={() => patch({ stage: 'changes' })} style={linkBtn}>They asked for changes</button>{' · '}</>}
                  <button onClick={() => { if (confirm(`Drop ${d.name} from the menu?`)) patch({ stage: 'dropped' }) }} style={linkBtn}>Drop from the menu</button>
                </>}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${MENU_ROAD.length}, minmax(0,1fr))`, opacity: dropped ? 0.4 : 1 }}>
          {MENU_ROAD.map((s, i) => {
            const info = stageInfo(s)
            const done = !dropped && i < idx
            const here = !dropped && i === idx
            return (
              <button key={s} onClick={() => patch({ stage: s })} title={`Set to "${info.label}"`}
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
              ✓ Signed off{d.signedOffBy ? ` by ${d.signedOffBy}` : ''}{d.signedOffAt ? ` on ${format(new Date(d.signedOffAt), 'EEE d MMM')}` : ''}.
            </p>
          ) : (
            <>
              <input key={`next-${d.nextStep ?? ''}`} defaultValue={d.nextStep ?? ''} placeholder={stage.doNext}
                onBlur={(e) => e.target.value.trim() !== (d.nextStep ?? '') && patch({ nextStep: e.target.value.trim() || undefined })}
                style={{ ...input, fontSize: '17px', fontWeight: 600, color: INK, border: '1px solid transparent', background: 'transparent', padding: '4px 0' }} />
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                {st.recipeNeed !== 'ready' && <Button onClick={() => ctx.writeRecipes([d])}>{st.recipeNeed === 'adapt' ? 'Adapt our recipe' : st.recipeNeed === 'classic_missing' ? 'Write our recipe' : 'Write the recipe'}</Button>}
                {d.stage === 'approved'
                  ? <Button variant={st.recipeNeed === 'ready' ? 'primary' : 'secondary'} onClick={signOff}>✓ Sign off</Button>
                  : next && <Button variant="secondary" onClick={() => patch({ stage: next, nextStep: undefined })}>✓ Done — go to &ldquo;{stageInfo(next).label}&rdquo;</Button>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: SECONDARY, marginLeft: 'auto' }}>
                  Owner
                  <select value={d.owner ?? ''} onChange={(e) => patch({ owner: e.target.value || undefined })}
                    style={{ ...input, width: '140px', padding: '6px 8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <option value="">—</option>
                    {ctx.staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
                  </select>
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: '14px' }}>
        <div style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
          {/* recipe */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ ...kicker, margin: 0 }}>Recipe</p>
              <Pill bg={rn.bg} fg={rn.fg}>{rn.label}</Pill>
            </div>
            {st.recipe ? (
              <p style={{ margin: 0, fontSize: '13px', color: SECONDARY }}>
                <Link href={`/recipes/${st.recipe.id}`} style={{ color: '#1d4ed8', fontWeight: 600 }}>{st.recipe.name}</Link>
                {st.costPerLitre !== null ? ` · ${money(st.costPerLitre)}/L` : ' · some ingredients unpriced'}
                {st.costPerServe !== null ? ` · ${money(st.costPerServe)} a serve` : st.serve ? '' : ' · set a serve size to cost a serve'}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: SECONDARY }}>
                {st.recipeNeed === 'classic_missing' && `We have no recipe for our ${d.classicName} yet — written once, it serves every venue.`}
                {st.recipeNeed === 'adapt' && `Start from our ${d.classicName}${d.spec ? ' or their spec' : ''} and change it.${st.costIsEstimate && st.costPerServe !== null ? ` Costed from ours for now: about ${money(st.costPerServe)} a serve.` : ''}`}
                {st.recipeNeed === 'write' && (d.spec ? 'Their spec is below — the recipe opens already filled from it.' : 'No spec yet — ask them for it, or write it from the tasting.')}
              </p>
            )}
          </div>

          {/* spec */}
          <div style={card}>
            <p style={kicker}>Their spec{d.spec && d.spec.fromName !== d.name ? ` · was "${d.spec.fromName}"` : ''}</p>
            {d.spec ? (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                  <tbody>
                    {d.spec.ingredients.map((l, i) => (
                      <tr key={l.name + i} style={{ borderTop: i ? '1px solid #f9fafb' : 'none' }}>
                        <td style={{ padding: '6px 10px 6px 0', color: INK }}>{l.name}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: SECONDARY, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{l.amount ?? ''} {l.unit}</td>
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
              <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>No spec on file. Drop a brief with it and it attaches here.</p>
            )}
          </div>

          {/* feedback + notes */}
          <div style={card}>
            <p style={kicker}>What they said</p>
            <input key={`fb-${d.feedback ?? ''}`} defaultValue={d.feedback ?? ''} placeholder="Their latest feedback — more yuzu, change the name…"
              onBlur={(e) => e.target.value.trim() !== (d.feedback ?? '') && patch({ feedback: e.target.value.trim() || undefined })}
              style={{ ...input, marginBottom: '14px', fontWeight: d.feedback ? 600 : 400 }} />
            <p style={kicker}>Write down what happened</p>
            <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await patch({}, note); setNote('') }} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tasted with Tom, wants it less sweet…" style={input} />
              <Button type="submit" disabled={!note.trim()}>Save</Button>
            </form>
            {(d.updates ?? []).slice(0, 12).map((u, i) => (
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

        <div style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
          {/* price + GP */}
          <div style={{ ...card, border: `1.5px solid ${g.verdict === 'pass' ? '#bbf7d0' : g.verdict === 'impossible' ? '#fecaca' : '#e5e7eb'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ ...kicker, margin: 0 }}>Price · can we guarantee {target}%?</p>
              <Pill bg={gv.bg} fg={gv.fg}>{gv.label}</Pill>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <label><span style={{ ...kicker, margin: '0 0 4px', display: 'block' }}>Their menu price</span>
                <NumInput value={d.menuPrice} placeholder="£" width="100%" onSave={(n) => patch({ menuPrice: n, ...unconfirm })} /></label>
              <label><span style={{ ...kicker, margin: '0 0 4px', display: 'block' }}>Our price / serve</span>
                <NumInput value={d.ourPrice} placeholder="£" width="100%" onSave={(n) => patch({ ourPrice: n, ...unconfirm })} /></label>
              <label><span style={{ ...kicker, margin: '0 0 4px', display: 'block' }}>Serve (ml)</span>
                <NumInput value={d.serveMl ?? st.serve ?? undefined} decimals={0} placeholder="ml" width="100%" onSave={(n) => patch({ serveMl: n, ...unconfirm })} /></label>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12.5px', color: SECONDARY }}>
              <select value={d.format} onChange={(e) => patch({ format: e.target.value as DevVariant, ...unconfirm })} style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: '12.5px', cursor: 'pointer' }}>
                <option value="premix">We supply it with the spirit</option>
                <option value="syrup">We supply it without — they add spirit</option>
              </select>
              {d.format === 'syrup' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Their spirit a serve <NumInput value={d.spiritCost} placeholder="£" onSave={(n) => patch({ spiritCost: n, ...unconfirm })} />
                </label>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center', padding: '10px 0', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6' }}>
              {[
                { l: 'Costs us', v: st.costPerServe !== null ? `${money(st.costPerServe)}${st.costIsEstimate ? '*' : ''}` : '—' },
                { l: 'Most we can charge', v: g.maxPrice !== undefined ? money(Math.max(0, g.maxPrice)) : '—' },
                { l: 'Their GP', v: g.venueGp !== undefined ? `${g.venueGp.toFixed(1)}%` : '—', c: g.venueGp === undefined ? MUTED : g.venueGp >= target ? '#166534' : '#b45309' },
                { l: 'Our GP', v: g.ourGp !== undefined ? `${g.ourGp.toFixed(1)}%` : '—', c: g.ourGp === undefined ? MUTED : g.ourGp >= floor ? '#166534' : '#b45309' },
              ].map((x) => (
                <div key={x.l}><p style={{ ...kicker, margin: 0 }}>{x.l}</p><p style={{ margin: '2px 0 0', fontSize: '16px', fontWeight: 700, color: x.c ?? INK }}>{x.v}</p></div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '12.5px', color: g.verdict === 'pass' ? '#166534' : g.verdict === 'impossible' ? '#991b1b' : SECONDARY }}>{g.reason}</p>
            {ownBuildGp !== null && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: MUTED }}>Made themselves for {money(d.theirCost!)} a serve, it is {ownBuildGp.toFixed(1)}% for them.</p>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
              {g.suggested !== undefined && g.suggested !== d.ourPrice && (
                <Button variant="secondary" onClick={() => patch({ ourPrice: g.suggested, ...unconfirm })}>Use {money(g.suggested)} a serve</Button>
              )}
              <Button variant={d.priceConfirmed ? 'secondary' : 'primary'} onClick={confirmPrice} disabled={!d.ourPrice && !d.priceConfirmed}>
                {d.priceConfirmed ? '✓ Price confirmed' : 'Confirm this price'}
              </Button>
              {d.priceConfirmed && <span style={{ fontSize: '12px', color: MUTED }}>{d.priceConfirmedBy ? `by ${d.priceConfirmedBy} ` : ''}{d.priceConfirmedAt ? `on ${format(new Date(d.priceConfirmedAt), 'd MMM')}` : ''}</span>}
            </div>
          </div>

          {/* our range */}
          <div style={card}>
            <p style={kicker}>Ours or new</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select value={d.overlap}
                onChange={(e) => {
                  const overlap = e.target.value as MenuOverlap
                  patch({ overlap, ...(overlap === 'none' ? { classicName: undefined } : {}), ...(overlap === 'same' ? { productId: undefined } : {}) }, undefined, `Now: ${OVERLAP_LABEL[overlap].label}`)
                }}
                style={{ ...input, cursor: 'pointer' }}>
                <option value="same">Same as our classic</option>
                <option value="twist">Twist on our classic</option>
                <option value="none">New — we make it</option>
              </select>
              <select value={d.classicName ?? ''} disabled={d.overlap === 'none'} onChange={(e) => patch({ classicName: e.target.value || undefined })}
                style={{ ...input, cursor: 'pointer', opacity: d.overlap === 'none' ? 0.5 : 1 }}>
                <option value="">Which classic?</option>
                {CORE_RANGE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: MUTED }}>
              {d.overlap === 'same' ? 'We make it as our classic — our recipe and cost apply.' : d.overlap === 'twist' ? 'Its own recipe, started from our classic. It becomes its own product at sign-off.' : 'Made from their spec. It becomes its own product at sign-off.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
