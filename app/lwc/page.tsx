'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { getIngredients, updateIngredient } from '@/lib/firestore/ingredients'
import { proposePrices, LWC_LINES, LWC_REBATE, PriceProposal } from '@/lib/lwcSync'
import { Ingredient } from '@/types'

const th: React.CSSProperties = {
  padding: '9px 12px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '9px 12px', fontSize: '13px', color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }

function money(n: number) { return '£' + n.toFixed(2) }

export default function LwcPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [rebate, setRebate] = useState(true)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [applying, setApplying] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [retro, setRetro] = useState(true)

  useEffect(() => { getIngredients().then(setIngredients).finally(() => setLoading(false)) }, [])

  const proposals = useMemo(() => proposePrices(ingredients, rebate, retro), [ingredients, rebate, retro])

  const matched = proposals.filter((p) => p.match && p.newPackPrice !== null)
  const changed = matched.filter((p) => Math.abs(p.delta ?? 0) >= 0.01)
  const rows = onlyChanges ? changed : matched
  const unmatched = proposals.filter((p) => !p.match && !p.ingredient.isProcess && p.ingredient.packUnit === 'L')

  // Changed lines start selected — untouched means "yes", so the common case is
  // one click. `picked` only ever records a deliberate deviation from that.
  const isPicked = (id: string) => picked[id] ?? true

  const selected = changed.filter((p) => isPicked(p.ingredient.id))
  const totalDelta = selected.reduce((s, p) => s + (p.delta ?? 0), 0)

  async function apply() {
    setApplying(true)
    let n = 0
    try {
      for (const p of selected) {
        if (p.newPackPrice === null) continue
        await updateIngredient(p.ingredient.id, { packPrice: p.newPackPrice })
        n++
      }
      setIngredients(await getIngredients())
      setDone(n)
      // Everything applied is now at LWC price, so nothing is left selected.
      setPicked(Object.fromEntries(selected.map((p) => [p.ingredient.id, false])))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div>
      <Header
        title="LWC pricing"
        subtitle={`${LWC_LINES.length} trade lines and the Pernod retro schedule. Re-price the library and every drink re-costs behind it.`}
        action={
          <Button size="sm" onClick={apply} loading={applying} disabled={!selected.length}>
            Fix {selected.length || ''} price{selected.length === 1 ? '' : 's'}
          </Button>
        }
      />

      {done !== null && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#166534' }}>
            <strong>{done} ingredient{done === 1 ? '' : 's'} re-priced.</strong> Open COGS to see the new cost per drink.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={rebate} onChange={(e) => { setRebate(e.target.checked); setPicked({}) }} />
          Apply the {(LWC_REBATE * 100).toFixed(0)}% rebate
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={retro} onChange={(e) => { setRetro(e.target.checked); setPicked({}) }} />
          Net off the Pernod retro
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          Only show price changes
        </label>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          {matched.length} matched · {changed.length} would change · {unmatched.length} not on the list
        </span>
        {selected.length > 0 && (
          <span style={{
            fontSize: '12px', fontWeight: 700, marginLeft: 'auto',
            color: totalDelta <= 0 ? '#166534' : '#b91c1c',
          }}>
            Net {totalDelta <= 0 ? 'saving' : 'increase'} on pack prices: {money(Math.abs(totalDelta))}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading ingredients…</p>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                <th style={{ ...th, width: '36px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((p) => isPicked(p.ingredient.id))}
                    onChange={(e) => setPicked(Object.fromEntries(rows.map((p) => [p.ingredient.id, e.target.checked])))}
                  />
                </th>
                <th style={{ ...th, textAlign: 'left' }}>Ingredient</th>
                <th style={{ ...th, textAlign: 'left' }}>Matched LWC line</th>
                <th style={th}>Retro</th>
                <th style={th}>Pack</th>
                <th style={th}>Now</th>
                <th style={th}>LWC</th>
                <th style={th}>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: PriceProposal) => {
                const up = (p.delta ?? 0) > 0
                return (
                  <tr key={p.ingredient.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isPicked(p.ingredient.id)}
                        onChange={(e) => setPicked({ ...picked, [p.ingredient.id]: e.target.checked })}
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#111827' }}>{p.ingredient.name}</td>
                    <td style={{ ...td, textAlign: 'left', color: '#6b7280', fontSize: '12px' }}>
                      {p.match?.line.name}
                      <span style={{
                        marginLeft: '7px', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px',
                        background: (p.match?.confidence ?? 0) > 0.85 ? '#dcfce7' : '#fef3c7',
                        color: (p.match?.confidence ?? 0) > 0.85 ? '#166534' : '#92400e',
                      }}>
                        {Math.round((p.match?.confidence ?? 0) * 100)}%
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: '12px', color: p.retro ? '#166534' : '#d1d5db' }}>
                      {p.retro ? `−${money(p.retro.perBottle)}` : '—'}
                    </td>
                    <td style={{ ...td, color: '#9ca3af', fontSize: '12px' }}>{p.ingredient.packDescription}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{money(p.ingredient.packPrice)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{money(p.newPackPrice ?? 0)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: up ? '#b91c1c' : '#166534' }}>
                      {up ? '+' : ''}{(p.delta ?? 0).toFixed(2)}
                      {p.deltaPct !== null && (
                        <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '5px' }}>
                          {up ? '+' : ''}{p.deltaPct.toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '36px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
                  Every matched ingredient is already at LWC pricing.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {unmatched.length > 0 && (
        <div style={{ marginTop: '18px', background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '16px 18px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>
            {unmatched.length} liquid ingredient{unmatched.length === 1 ? '' : 's'} not on the LWC list
          </p>
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 10px' }}>
            Bought elsewhere, or named differently here than on the trade list. These keep their current price.
          </p>
          <p style={{ fontSize: '12.5px', color: '#6b7280', margin: 0, lineHeight: 1.7 }}>
            {unmatched.map((p) => p.ingredient.name).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
