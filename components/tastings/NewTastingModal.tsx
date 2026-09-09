'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import { createTasting } from '@/lib/firestore/tastings'
import { splitRecipeCost } from '@/lib/pricing'
import {
  Account, Product, Recipe, Ingredient, TastingItem, TastingStage,
  DevVariant, DEV_VARIANTS, TASTING_STAGES,
} from '@/types'
import { StaffUser } from '@/lib/firestore/staffUsers'
import toast from 'react-hot-toast'

interface Props {
  accounts: Account[]
  products: Product[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  staff: StaffUser[]
  onClose: () => void
  onSaved: () => void
}

const label: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: '7px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

function money(n: number) { return '£' + n.toFixed(2) }

export default function NewTastingModal({ accounts, products, recipes, ingredients, staff, onClose, onSaved }: Props) {
  const [accountId, setAccountId] = useState('')
  const [prospect, setProspect] = useState('')
  const [contact, setContact] = useState('')
  const [when, setWhen] = useState('')
  const [where, setWhere] = useState('')
  const [owner, setOwner] = useState('')
  const [stage, setStage] = useState<TastingStage>('requested')
  const [notes, setNotes] = useState('')
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [picked, setPicked] = useState<Record<string, TastingItem>>({})
  const [saving, setSaving] = useState(false)

  // What each drink costs us per litre in each format — the syrup without the
  // spirit, because the venue pours its own.
  const costs = useMemo(() => {
    const m: Record<string, { premix: number | null; syrup: number | null }> = {}
    for (const p of products) {
      const r = recipes.find((x) => x.productId === p.id)
      if (!r) { m[p.id] = { premix: null, syrup: null }; continue }
      const split = splitRecipeCost(r, ingredients)
      m[p.id] = {
        premix: split.complete ? split.totalPerLitre : null,
        syrup: split.mixerPerLitre || null,
      }
    }
    return m
  }, [products, recipes, ingredients])

  const pool = useMemo(() => {
    const live = products.filter((p) => p.isActive !== false)
    const base = showAll ? live : live.filter((p) => p.isClassic)
    if (!q.trim()) return base
    const n = q.toLowerCase()
    return live.filter((p) => p.name.toLowerCase().includes(n))
  }, [products, showAll, q])

  function toggle(p: Product, variant: DevVariant) {
    const key = `${p.id}§${variant}`
    setPicked((prev) => {
      const next = { ...prev }
      if (next[key]) { delete next[key]; return next }
      const cost = costs[p.id]?.[variant]
      next[key] = {
        productId: p.id,
        productName: p.name,
        variant,
        // Open at a price that clears 50% for us, so the field starts sane
        // rather than at zero and gets left there.
        pricePerLitre: cost ? Math.round(cost * 2 * 100) / 100 : 0,
        servingMl: p.recommendedServingG || 100,
        verdict: 'pending',
      }
      return next
    })
  }

  function setPrice(key: string, field: 'pricePerLitre' | 'rrp', value: string) {
    const n = parseFloat(value)
    setPicked((prev) => ({ ...prev, [key]: { ...prev[key], [field]: Number.isFinite(n) ? n : 0 } }))
  }

  const items = Object.values(picked)
  const account = accounts.find((a) => a.id === accountId)
  const name = account ? (account.tradingName || account.legalName) : prospect.trim()

  async function save() {
    if (!name) return toast.error('Who is the tasting for?')
    if (!items.length) return toast.error('Pick at least one cocktail to pour')
    setSaving(true)
    try {
      await createTasting({
        accountId: account?.id,
        accountName: name,
        isProspect: !account,
        stage,
        scheduledAt: when ? new Date(when + 'T12:00:00') : undefined,
        location: where.trim() || undefined,
        owner: owner || undefined,
        contact: contact.trim() || undefined,
        items,
        notes: notes.trim() || undefined,
        updates: [{ at: new Date().toISOString(), text: `Tasting created for ${name}`, kind: 'auto' }],
      })
      toast.success(`Tasting for ${name} created`)
      onSaved()
      onClose()
    } catch {
      toast.error('Could not save')
    } finally { setSaving(false) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '840px', padding: '24px 26px 26px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>New tasting</h2>
            <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>
              Who it is for, when, and what we are pouring at what price.
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#d1d5db' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <span style={label}>Existing account</span>
            <select
              value={accountId}
              onChange={(e) => { setAccountId(e.target.value); if (e.target.value) setProspect('') }}
              style={{ ...input, cursor: 'pointer' }}
            >
              <option value="">A prospect — type the name →</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.tradingName || a.legalName}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={label}>Prospect name</span>
            <input
              value={prospect}
              onChange={(e) => { setProspect(e.target.value); if (e.target.value) setAccountId('') }}
              placeholder="The venue we are chasing"
              disabled={!!accountId}
              style={{ ...input, background: accountId ? '#f9fafb' : '#fff' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          <div>
            <span style={label}>Date</span>
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={input} />
          </div>
          <div>
            <span style={label}>Where</span>
            <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Their bar, ours…" style={input} />
          </div>
          <div>
            <span style={label}>Owner</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">—</option>
              {staff.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as TastingStage)} style={{ ...input, cursor: 'pointer' }}>
              {TASTING_STAGES.filter((s) => s.value !== 'cancelled').map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <span style={label}>Their contact</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name, role, email" style={input} />
        </div>

        {/* the pour list */}
        <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              What we are pouring · {items.length} picked
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search every drink…"
                style={{ ...input, width: '200px', padding: '5px 9px', fontSize: '12.5px' }}
              />
              <button
                onClick={() => setShowAll((v) => !v)}
                style={{
                  border: '1px solid #e5e7eb', background: '#fff', borderRadius: '7px',
                  padding: '5px 11px', fontSize: '12px', color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {showAll ? 'Core range only' : 'Show everything'}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '230px', overflowY: 'auto', border: '1px solid #f9fafb', borderRadius: '8px' }}>
            {pool.length === 0 && (
              <p style={{ margin: 0, padding: '16px', fontSize: '12.5px', color: '#9ca3af' }}>Nothing matches.</p>
            )}
            {pool.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 11px', borderBottom: '1px solid #fafafa' }}>
                <span style={{ flex: 1, fontSize: '12.5px', color: '#374151', fontWeight: 500 }}>
                  {p.name}
                  {!p.isClassic && <span style={{ color: '#d1d5db', marginLeft: '7px', fontSize: '11px' }}>off-range</span>}
                </span>
                {DEV_VARIANTS.map((v) => {
                  const key = `${p.id}§${v.value}`
                  const on = !!picked[key]
                  const cost = costs[p.id]?.[v.value as DevVariant]
                  return (
                    <button
                      key={v.value}
                      onClick={() => toggle(p, v.value as DevVariant)}
                      title={cost ? `${money(cost)}/L to make` : 'No recipe, so no cost'}
                      style={{
                        border: `1px solid ${on ? '#111827' : '#e5e7eb'}`,
                        background: on ? '#111827' : '#fff',
                        color: on ? '#fff' : '#6b7280',
                        borderRadius: '20px', padding: '3px 10px', fontSize: '11.5px',
                        fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {on ? '✓ ' : '+ '}{v.short}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* prices for what was picked */}
        {items.length > 0 && (
          <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '600px' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Cocktail', 'Version', 'Costs us / L', 'We charge / L', 'Their menu price', 'Our GP', 'Their GP'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 10px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      textAlign: h === 'Cocktail' || h === 'Version' ? 'left' : 'right',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(picked).map(([key, it]) => {
                  const cost = costs[it.productId]?.[it.variant]
                  const ourGp = cost !== null && cost !== undefined && it.pricePerLitre > 0
                    ? ((it.pricePerLitre - cost) / it.pricePerLitre) * 100 : null
                  // What the serve costs them: our pour, plus their own spirit
                  // when they are buying the syrup — which we cannot price here.
                  const theirCost = (it.pricePerLitre * it.servingMl) / 1000
                  const net = (it.rrp ?? 0) / 1.2
                  const theirGp = net > 0 ? ((net - theirCost) / net) * 100 : null
                  return (
                    <tr key={key} style={{ borderTop: '1px solid #f9fafb' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: '#111827' }}>{it.productName}</td>
                      <td style={{ padding: '6px 10px', color: '#6b7280' }}>
                        {DEV_VARIANTS.find((v) => v.value === it.variant)?.short}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: cost ? '#6b7280' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                        {cost ? money(cost) : 'no recipe'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <input
                          value={it.pricePerLitre || ''}
                          onChange={(e) => setPrice(key, 'pricePerLitre', e.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal"
                          style={{ ...input, width: '86px', padding: '4px 7px', textAlign: 'right', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <input
                          value={it.rrp ?? ''}
                          onChange={(e) => setPrice(key, 'rrp', e.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal"
                          placeholder="—"
                          style={{ ...input, width: '86px', padding: '4px 7px', textAlign: 'right', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td style={{
                        padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: ourGp === null ? '#d1d5db' : ourGp < 0 ? '#b91c1c' : ourGp < 40 ? '#b45309' : '#166534',
                      }}>
                        {ourGp === null ? '—' : ourGp.toFixed(0) + '%'}
                      </td>
                      <td style={{
                        padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: theirGp === null ? '#d1d5db' : theirGp >= 75 ? '#166534' : '#b45309',
                      }}>
                        {theirGp === null ? '—' : theirGp.toFixed(0) + '%'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginBottom: '18px' }}>
          <span style={label}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What they asked for, who is coming, anything Mark needs to know"
            style={{ ...input, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={saving || !name || !items.length}>
            Create the tasting
          </Button>
        </div>

        <p style={{ fontSize: '11.5px', color: '#9ca3af', margin: '14px 0 0', lineHeight: 1.55 }}>
          Their GP is worked out on the menu price net of VAT against what our pour costs them — for the syrup it
          ignores the spirit they pour themselves, so the real figure is a little lower. Our GP is against the live
          recipe cost, so it moves when an ingredient price does.
        </p>
      </div>
    </div>
  )
}
