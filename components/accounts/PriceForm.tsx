'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { upsertAccountPricing, updateProduct } from '@/lib/firestore/catalog'
import { AccountPricing, Product } from '@/types'
import toast from 'react-hot-toast'

export interface PricingTarget { accountId: string; accountName: string; groupId?: string; groupName?: string }

const r2 = (n: number) => Math.round(n * 100) / 100
export const VENUE_GP_TARGET = 80

/**
 * The numbers behind one price, per serve — what the venue pays us for a
 * serve, what they sell it for, what it costs us, and who keeps what.
 */
export function priceMetrics(pricePerLitre: number, servingMl: number, rsp: number, costPerLitre: number | null) {
  const perServe = pricePerLitre > 0 && servingMl > 0 ? (pricePerLitre * servingMl) / 1000 : 0
  const costPerServe = costPerLitre !== null && servingMl > 0 ? (costPerLitre * servingMl) / 1000 : null
  const net = rsp / 1.2
  const venueGp = rsp > 0 && perServe > 0 ? ((net - perServe) / net) * 100 : null
  const ourGp = costPerLitre !== null && pricePerLitre > 0 ? ((pricePerLitre - costPerLitre) / pricePerLitre) * 100 : null
  // The most per litre we can charge while they keep the target on their RSP.
  const pplForTarget = rsp > 0 && servingMl > 0 ? r2(((net * (1 - VENUE_GP_TARGET / 100)) * 1000) / servingMl) : null
  return { perServe, costPerServe, venueGp, ourGp, pplForTarget }
}

export function gpTone(value: number | null, kind: 'venue' | 'ours') {
  if (value === null) return { bg: '#f3f4f6', fg: '#9ca3af' }
  const [good, ok] = kind === 'venue' ? [VENUE_GP_TARGET, 75] : [50, 30]
  return value >= good ? { bg: '#dcfce7', fg: '#166534' } : value >= ok ? { bg: '#fef3c7', fg: '#92400e' } : { bg: '#fee2e2', fg: '#991b1b' }
}

export function GpBadge({ value, kind }: { value: number | null; kind: 'venue' | 'ours' }) {
  const t = gpTone(value, kind)
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
      {value === null ? '—' : `${value.toFixed(1)}%`}
    </span>
  )
}

const miniBtn: React.CSSProperties = { border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#1d4ed8', textDecoration: 'underline', fontFamily: 'inherit' }
const label: React.CSSProperties = { display: 'block', fontSize: '10.5px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }

export default function PriceForm({ product, existing, costPerLitre, costNote, target, onSaved, onCancel }: {
  product: Product
  existing?: AccountPricing
  costPerLitre: number | null
  /** Why there is no cost, when there is not one. */
  costNote?: string
  target: PricingTarget
  onSaved: (productId: string) => void
  onCancel: () => void
}) {
  const startVol = existing?.volumeLitres ?? product.volumeLitres ?? 5
  // A new price starts from the product's default; an existing one keeps its own.
  const [ppl, setPpl] = useState(existing ? String(r2(existing.pricePerLitre || existing.pricePerUnit / startVol)) : product.defaultPricePerLitre ? String(product.defaultPricePerLitre) : '')
  const [dflt, setDflt] = useState<number | undefined>(product.defaultPricePerLitre)
  const [vol, setVol] = useState(String(startVol))
  const [serve, setServe] = useState(String(existing?.recommendedServingG || product.recommendedServingG || 100))
  const [rsp, setRsp] = useState(existing?.rrp ? String(existing.rrp) : '')
  const [saving, setSaving] = useState(false)

  const pplN = parseFloat(ppl) || 0
  const volN = parseFloat(vol) || 5
  const serveN = parseFloat(serve) || 0
  const rspN = parseFloat(rsp) || 0
  const m = priceMetrics(pplN, serveN, rspN, costPerLitre)

  async function saveDefault() {
    if (pplN <= 0) return
    const value = r2(pplN)
    await updateProduct(product.id, { defaultPricePerLitre: value })
    setDflt(value)
    toast.success(`£${value.toFixed(2)}/L is now ${product.name}'s default`)
  }

  async function save() {
    if (pplN <= 0) return toast.error('Put in a price per litre')
    if (serveN <= 0) return toast.error('Put in a serving size')
    setSaving(true)
    try {
      const entry: Omit<AccountPricing, 'id' | 'createdAt' | 'updatedAt'> = {
        accountId: target.accountId,
        accountName: target.accountName,
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        recommendedServingG: serveN,
        volumeLitres: volN,
        pricePerLitre: pplN,
        pricePerUnit: r2(pplN * volN),
        rrp: rspN,
        venueGpPercent: m.venueGp !== null ? r2(m.venueGp) : 0,
        foodlabGpPercent: m.ourGp !== null ? r2(m.ourGp) : 0,
      }
      if (target.groupId) entry.groupId = target.groupId
      if (target.groupName) entry.groupName = target.groupName
      await upsertAccountPricing(entry)
      toast.success(`${product.name} priced for ${target.accountName}`)
      onSaved(product.id)
    } catch (e) {
      console.error(e)
      toast.error('Could not save the price')
    } finally { setSaving(false) }
  }

  const money = (n: number) => `£${n.toFixed(2)}`

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#111827' }}>{product.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#9ca3af', fontFamily: 'monospace' }}>
            {product.productCode} · {costPerLitre !== null ? `costs us ${money(costPerLitre)}/L` : costNote ?? 'no cost yet'}
          </p>
        </div>
        <button onClick={onCancel} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#9ca3af' }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1.1fr', gap: '12px', marginBottom: '14px' }}>
        <label><span style={label}>Our price / litre *</span>
          <input style={field} inputMode="decimal" value={ppl} onChange={(e) => setPpl(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="£ e.g. 30.00" />
          {dflt ? (
            <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#6b7280' }}>
              Default £{dflt.toFixed(2)}/L
              {Math.abs(pplN - dflt) >= 0.01 && <> · <button type="button" onClick={() => setPpl(String(dflt))} style={miniBtn}>use default</button> · <button type="button" onClick={saveDefault} style={miniBtn}>make this the default</button></>}
            </span>
          ) : (
            <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#9ca3af' }}>
              No default price{pplN > 0 && <> · <button type="button" onClick={saveDefault} style={miniBtn}>make £{pplN.toFixed(2)} the default</button></>}
            </span>
          )}</label>
        <label><span style={label}>Pack</span>
          <div style={{ display: 'flex', gap: '5px' }}>
            {['5', '10', '19'].map((v) => (
              <button key={v} type="button" onClick={() => setVol(v)} style={{
                flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${vol === v ? '#111827' : '#d1d5db'}`, background: vol === v ? '#111827' : '#fff', color: vol === v ? '#fff' : '#374151',
              }}>{v}L</button>
            ))}
          </div></label>
        <label><span style={label}>Serving (ml) *</span>
          <input style={field} inputMode="decimal" value={serve} onChange={(e) => setServe(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="100" /></label>
        <label><span style={label}>RSP — their menu price</span>
          <input style={field} inputMode="decimal" value={rsp} onChange={(e) => setRsp(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="£ inc VAT e.g. 14.00" /></label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: '10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
        {[
          { l: 'Price / serve', v: m.perServe > 0 ? money(m.perServe) : '—' },
          { l: 'RSP', v: rspN > 0 ? money(rspN) : '—' },
          { l: 'Cost / serve', v: m.costPerServe !== null ? money(m.costPerServe) : '—', note: m.costPerServe === null ? (costNote ?? 'no recipe cost') : undefined },
          { l: `Pack of ${volN}L`, v: pplN > 0 ? money(pplN * volN) : '—' },
        ].map((x) => (
          <div key={x.l}>
            <p style={{ ...label, marginBottom: '2px' }}>{x.l}</p>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: x.v === '—' ? '#d1d5db' : '#111827' }}>{x.v}</p>
            {x.note && <p style={{ margin: '1px 0 0', fontSize: '10.5px', color: '#b45309' }}>{x.note}</p>}
          </div>
        ))}
        <div><p style={{ ...label, marginBottom: '4px' }}>Venue GP</p><GpBadge value={m.venueGp} kind="venue" /></div>
        <div><p style={{ ...label, marginBottom: '4px' }}>Our GP</p><GpBadge value={m.ourGp} kind="ours" /></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" onClick={save} loading={saving} disabled={saving}>{existing ? 'Update price' : 'Save price'}</Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        {m.pplForTarget !== null && Math.abs(m.pplForTarget - pplN) >= 0.01 && (
          <button onClick={() => setPpl(String(m.pplForTarget))} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: '20px', padding: '4px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            Use £{m.pplForTarget.toFixed(2)}/L — they keep {VENUE_GP_TARGET}%
          </button>
        )}
        <span style={{ fontSize: '11.5px', color: '#9ca3af', marginLeft: 'auto' }}>
          Venue GP on the RSP without VAT · our GP against the recipe cost
        </span>
      </div>
    </div>
  )
}
