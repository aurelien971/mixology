'use client'

import { DEFAULT_GP_TARGET, DEFAULT_MARGIN_FLOOR, GP_VERDICT, GpVerdict, OVERLAP_LABEL } from '@/lib/onboarding'
import { MenuDrink } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, card, kicker, Pill, NumInput, money } from './shared'

/**
 * Can we guarantee them their GP? For every drink: the most we can charge and
 * they keep the target, the least we can charge and keep ours, and a price.
 */
export default function GpSection({ ctx }: { ctx: VenueCtx }) {
  const { venue: v } = ctx
  const target = v.gpTarget ?? DEFAULT_GP_TARGET
  const floor = v.marginFloor ?? DEFAULT_MARGIN_FLOOR
  const active = ctx.drinks.filter((d) => d.stage !== 'dropped')
  const verdicts: GpVerdict[] = ['pass', 'set_price', 'fails', 'impossible', 'unknown']
  const count = (vd: GpVerdict) => active.filter((d) => ctx.states.get(d.id)?.gp.verdict === vd).length

  const unconfirm = (d: MenuDrink) =>
    d.priceConfirmed ? { priceConfirmed: false, priceConfirmedBy: undefined, priceConfirmedAt: undefined } : {}

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ ...card, display: 'flex', gap: '26px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p style={{ ...kicker, margin: 0 }}>Guaranteed</p>
          <p style={{ margin: '2px 0 0', fontSize: '26px', fontWeight: 700, color: count('pass') === active.length && active.length ? '#166534' : INK }}>
            {count('pass')} of {active.length}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {verdicts.filter((vd) => vd !== 'pass').map((vd) => (
            <Pill key={vd} bg={GP_VERDICT[vd].bg} fg={GP_VERDICT[vd].fg}>{GP_VERDICT[vd].label} · {count(vd)}</Pill>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center', fontSize: '12.5px', color: SECONDARY }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            They keep at least
            <NumInput value={target} decimals={0} width="56px" onSave={(n) => ctx.patchVenue({ gpTarget: n ?? DEFAULT_GP_TARGET }, undefined, `GP target for them → ${n ?? DEFAULT_GP_TARGET}%`)} />%
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            We keep at least
            <NumInput value={floor} decimals={0} width="56px" onSave={(n) => ctx.patchVenue({ marginFloor: n ?? DEFAULT_MARGIN_FLOOR }, undefined, `Our margin floor → ${n ?? DEFAULT_MARGIN_FLOOR}%`)} />%
          </label>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '1080px', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {['Drink', 'Menu £', 'Our cost / serve', 'Most we can charge', 'Least we need', 'Our £ / serve', 'Their GP', 'Our GP', 'Verdict'].map((h, i) => (
                <th key={h} style={{ ...kicker, margin: 0, padding: '9px 10px', textAlign: i === 0 || i === 8 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((d) => {
              const st = ctx.states.get(d.id)
              if (!st) return null
              const g = st.gp
              const gv = GP_VERDICT[g.verdict]
              return (
                <tr key={d.id} style={{ borderTop: '1px solid #f9fafb' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <button onClick={() => ctx.openDrink(d.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: INK, textAlign: 'left' }}>{d.name}</button>
                    <span style={{ display: 'block', fontSize: '11px', color: MUTED }}>
                      {OVERLAP_LABEL[d.overlap].short}{st.serve ? ` · ${st.serve}ml` : ' · no serve size'}{d.format === 'syrup' ? ' · no spirit' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <NumInput value={d.menuPrice} placeholder="£" onSave={(n) => ctx.patchDrink(d, { menuPrice: n, ...unconfirm(d) })} />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: st.costPerServe === null ? '#d1d5db' : SECONDARY, fontVariantNumeric: 'tabular-nums' }}>
                    {st.costPerServe === null ? (st.recipeNeed === 'ready' ? 'no serve size' : 'no recipe') : `${money(st.costPerServe)}${st.costIsEstimate ? '*' : ''}`}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: SECONDARY }}>
                    {g.maxPrice === undefined ? '—' : money(Math.max(0, g.maxPrice))}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: SECONDARY }}>
                    {g.minPrice === undefined ? '—' : money(g.minPrice)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {g.suggested !== undefined && g.suggested !== d.ourPrice && (
                        <button onClick={() => ctx.patchDrink(d, { ourPrice: g.suggested, ...unconfirm(d) })}
                          title="Most we can charge while they keep their GP"
                          style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Use {money(g.suggested)}
                        </button>
                      )}
                      <NumInput value={d.ourPrice} placeholder="£" onSave={(n) => ctx.patchDrink(d, { ourPrice: n, ...unconfirm(d) })} />
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: g.venueGp === undefined ? '#d1d5db' : g.venueGp >= target ? '#166534' : '#b45309' }}>
                    {g.venueGp === undefined ? '—' : `${g.venueGp.toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: g.ourGp === undefined ? '#d1d5db' : g.ourGp >= floor ? '#166534' : '#b45309' }}>
                    {g.ourGp === undefined ? '—' : `${g.ourGp.toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <Pill bg={gv.bg} fg={gv.fg}>{gv.label}</Pill>
                    <span style={{ display: 'block', fontSize: '11.5px', color: SECONDARY, marginTop: '3px', maxWidth: '260px' }}>{g.reason}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ margin: 0, padding: '10px 14px', fontSize: '12px', color: MUTED, borderTop: '1px solid #f3f4f6' }}>
          Their GP is on the menu price without VAT, against what the serve costs them — our price, plus their spirit on the no-spirit format.
          &ldquo;Most we can charge&rdquo; leaves them exactly {target}%; &ldquo;Least we need&rdquo; keeps our {floor}%. * = a twist costed from our classic until its own recipe is written.
          Changing a confirmed price un-confirms it.
        </p>
      </div>
    </div>
  )
}
