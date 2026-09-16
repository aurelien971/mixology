'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import Button from '@/components/ui/Button'
import { useTable, ColumnDef } from '@/hooks/useTable'
import { OVERLAP_LABEL, RECIPE_NEED, GP_VERDICT, DrinkState, stageInfo } from '@/lib/onboarding'
import { MenuDrink, MenuStage, MENU_STAGES } from '@/types'
import { VenueCtx, INK, MUTED, Pill, money } from './shared'

interface Row { d: MenuDrink; st: DrinkState }
type Filter = 'all' | 'same' | 'twist' | 'none' | 'open'

const stageIdx = (s: MenuStage) => MENU_STAGES.findIndex((x) => x.value === s)

const COLUMNS: ColumnDef<Row>[] = [
  { key: 'order',    label: '#',             width: 44,  align: 'right', sortValue: (r) => r.d.order },
  { key: 'name',     label: 'Drink',         width: 210, sortValue: (r) => r.d.name },
  { key: 'overlap',  label: 'Ours or new',   width: 150, sortValue: (r) => r.d.overlap },
  { key: 'stage',    label: 'Step',          width: 150, sortValue: (r) => stageIdx(r.d.stage) },
  { key: 'recipe',   label: 'Recipe',        width: 140, sortValue: (r) => r.st.recipeNeed },
  { key: 'menu',     label: 'Menu £',        width: 84,  align: 'right', sortValue: (r) => r.d.menuPrice, descFirst: true },
  { key: 'ours',     label: 'Our £ / serve', width: 104, align: 'right', sortValue: (r) => r.d.ourPrice, descFirst: true },
  { key: 'venueGp',  label: 'Their GP',      width: 84,  align: 'right', sortValue: (r) => r.st.gp.venueGp, descFirst: true },
  { key: 'gp',       label: '80% check',     width: 130, sortValue: (r) => r.st.gp.verdict },
  { key: 'feedback', label: 'Feedback / next', width: 230, sortValue: (r) => r.d.feedback ?? r.d.nextStep },
  { key: 'signed',   label: 'Signed off',    width: 140, sortValue: (r) => r.d.signedOffAt },
]

export default function MenuSection({ ctx, onAdd, onDropBrief }: { ctx: VenueCtx; onAdd: () => void; onDropBrief: () => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const cols = useTable<Row>('onboarding-menu', COLUMNS)
  const all: Row[] = ctx.drinks.map((d) => ({ d, st: ctx.states.get(d.id)! })).filter((r) => r.st)
  const count = (f: Filter) => all.filter((r) => match(r, f)).length
  const rows = all.filter((r) => match(r, filter))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {([['all', 'All'], ['same', 'Ours'], ['twist', 'Twists'], ['none', 'New'], ['open', 'Not signed off']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              border: 'none', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: filter === k ? INK : '#f3f4f6', color: filter === k ? '#fff' : '#6b7280',
            }}>{l} {count(k)}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <cols.ResetButton />
          <Button size="sm" variant="secondary" onClick={onDropBrief}>Drop a brief</Button>
          <Button size="sm" onClick={onAdd}>+ Add drinks</Button>
        </div>
      </div>

      {all.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: MUTED }}>No menu yet. Drop their brief, or add drinks from our range and new ones by hand.</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <Button onClick={onDropBrief}>Drop their brief</Button>
            <Button variant="secondary" onClick={onAdd}>+ Add drinks</Button>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', overflowX: 'auto' }}>
          <table className="dt" style={{ minWidth: cols.minWidth }}>
            <cols.ColGroup />
            <cols.Head />
            <tbody>
              {cols.sortRows(rows).map(({ d, st }) => {
                const stage = stageInfo(d.stage)
                const ov = OVERLAP_LABEL[d.overlap]
                const rn = RECIPE_NEED[st.recipeNeed]
                const gv = GP_VERDICT[st.gp.verdict]
                return (
                  <tr key={d.id}
                    onClick={(e) => { if ((e.target as HTMLElement).closest('select, button, a, input')) return; ctx.openDrink(d.id) }}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #f9fafb', opacity: d.stage === 'dropped' ? 0.45 : 1, background: d.stage === 'signed_off' ? '#f7fdf9' : undefined }}>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: MUTED, fontSize: '12px' }}>{d.order}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: INK, fontSize: '14px' }}>
                      {d.name}{d.format === 'syrup' && <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 500, color: MUTED }}>no spirit</span>}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <Pill bg={ov.bg} fg={ov.fg}>{d.overlap === 'none' ? ov.label : `${ov.short} · ${d.classicName ?? '?'}`}</Pill>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <select value={d.stage} onChange={(e) => ctx.patchDrink(d, { stage: e.target.value as MenuStage })}
                        style={{ width: '100%', padding: '4px 6px', border: 'none', borderRadius: '20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: stage.bg, color: stage.fg, textAlign: 'center' }}>
                        {MENU_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px 8px' }}><Pill bg={rn.bg} fg={rn.fg}>{rn.label}</Pill></td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: d.menuPrice ? INK : MUTED }}>{d.menuPrice ? money(d.menuPrice) : '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: d.ourPrice ? INK : MUTED }}>{d.ourPrice ? money(d.ourPrice) : '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: st.gp.venueGp === undefined ? MUTED : st.gp.venueGp >= (ctx.venue.gpTarget ?? 80) ? '#166534' : '#b45309' }}>
                      {st.gp.venueGp === undefined ? '—' : `${st.gp.venueGp.toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '10px 8px' }}><Pill bg={gv.bg} fg={gv.fg} title={st.gp.reason}>{gv.label}</Pill></td>
                    <td style={{ padding: '10px 8px', fontSize: '12.5px', color: d.feedback ? INK : MUTED }}>{d.feedback ? `“${d.feedback}”` : d.nextStep ?? stage.doNext}</td>
                    <td style={{ padding: '10px 8px', fontSize: '12px', color: d.signedOffAt ? '#166534' : MUTED }}>
                      {d.signedOffAt ? `${d.signedOffBy ?? '✓'} · ${format(new Date(d.signedOffAt), 'd MMM')}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function match(r: Row, f: Filter) {
  if (f === 'all') return true
  if (f === 'open') return r.d.stage !== 'signed_off' && r.d.stage !== 'dropped'
  return r.d.overlap === f
}
